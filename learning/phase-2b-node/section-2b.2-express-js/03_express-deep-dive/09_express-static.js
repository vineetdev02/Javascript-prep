// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  09_express-static.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: express.static()
//
// WHAT YOU WILL MASTER HERE:
//   1. What static actually is — an ordinary middleware that maps a URL path
//      onto a directory, and calls next() when the file isn't there
//   2. That fallthrough proven: a missing file produces NO response from
//      static, which is why a route below it still gets its turn
//   3. Position: the same three lines in two orders, serving a file in one
//      and a route handler in the other for the identical URL
//   4. Path traversal, executed: a naive join reading a file OUTSIDE the
//      root, and the resolve-and-contain check that stops it — using the
//      exact '../etc/passwd' value 06 §8 produced
//   5. Caching, measured: ETag/Last-Modified → 304 with zero bytes, and what
//      max-age + immutable are actually for
//   6. The one-line disaster: express.static(__dirname), and the .env file
//      it hands out
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/09_express-static.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js §4 (order is the API),
// 06_route-params-vs-query-params.js §8 (a URL-encoded '../' survives into a
// decoded path), 08_res-json-vs-res-send.js §7 (ETag and the 304), and
// section-2b.1-node-core/02_streams-and-buffers/07_fs-streams-for-large-files.js
// (why a file response is streamed and not read into a Buffer).
//
// The file creates a small temporary directory, serves it, and deletes it.


const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const results = {};

// ── fixture: a tiny site, plus one secret file OUTSIDE its root ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jshub-static-"));
const ROOT = path.join(TMP, "public");
fs.mkdirSync(path.join(ROOT, "sub"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "index.html"), "<h1>home</h1>");
fs.writeFileSync(path.join(ROOT, "app.js"), "console.log('client');");
fs.writeFileSync(path.join(ROOT, "style.css"), "body{margin:0}");
fs.writeFileSync(path.join(ROOT, "data.json"), '{"from":"disk"}');
fs.writeFileSync(path.join(ROOT, ".env"), "DB_PASSWORD=hunter2");
fs.writeFileSync(path.join(ROOT, "sub", "index.html"), "<h1>sub</h1>");
fs.writeFileSync(path.join(TMP, "secrets.txt"), "AWS_SECRET_ACCESS_KEY=live-key");


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// express.static(root, options):
// a middleware that maps the request path onto a file inside `root`, streams
// it back with a content type, length and caching headers if it exists — and
// calls next() if it doesn't, so a missing file is not a 404 from static, it
// is simply a request static declined to answer.
//
// If interviewer says "explain it simply", say:
//   "It's a middleware like any other. It takes the request path, joins it
//    to a directory you nominated, and if a readable file is there it
//    streams it with the right Content-Type and caching headers. If there
//    isn't, it calls next() and the rest of your app carries on. That
//    fallthrough is the part people don't expect — static never produces the
//    404 itself."
//
// If interviewer says "what would you be careful about?", say:
//   "Three things: the root you point it at, because it will serve
//    everything underneath it; the position in the stack, because whichever
//    of static and your routes comes first wins the URL; and the caching
//    headers, because the default is revalidate-every-time, which is a round
//    trip per asset per page load."
//
// Why it matters in interviews:
//   It is the only built-in middleware that touches the filesystem, so it is
//   the one where a mistake is a file disclosure rather than a bug. The
//   traversal demo in §6 is the part worth being able to reproduce.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   IT MAPS URLs ONTO A DIRECTORY, AND MISSES FALL THROUGH.
//
// Runtime rule:
//   decode the path → join it to root → RESOLVE it and verify the result is
//   still inside root → stat it → directory? try index.html → set
//   Content-Type from the extension, Content-Length, Last-Modified, ETag →
//   answer 304 if the client's validators match → otherwise stream the file.
//   Any miss, any dotfile, any non-GET/HEAD: next().
//
// Practical rule:
//   Point it at a dedicated build output directory, never at the project
//   root and never at __dirname. Mount it under a prefix ('/static') so the
//   URL space is explicit. Put it above your API routes but below helmet and
//   cors. Serve hashed filenames with a long max-age and immutable.
//
// Common trap:
//   express.static(__dirname) — or serving the repository root during
//   "quick local testing" — which publishes .env, .git, package.json and
//   your source. §8 does it, on purpose, to show the response.
//
// The mental picture:
//
//   GET /static/app.js
//        └── mount '/static' stripped (04 §4) → '/app.js'
//                        │
//        root + '/app.js' → /srv/build/app.js
//                        │
//        resolve → is it still under /srv/build?  ── no ──▶ 403 / next()
//                        │ yes
//        stat → exists?  ── no ──▶ next()   ← NOT a 404
//                        │ yes
//        Content-Type from '.js' · Length · Last-Modified · ETag
//                        │
//        If-None-Match matches? ── yes ──▶ 304, zero bytes
//                        │ no
//                     stream it


// ══════════════════════════════════════════════════════════════════
// § 3 — IMPLEMENTING IT, SAFELY AND UNSAFELY
// ══════════════════════════════════════════════════════════════════

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function fileEtag(stat) {
  return 'W/"' + stat.size.toString(16) + "-" + stat.mtimeMs.toString(16) + '"';
}

// ✅ The safe version — the containment check on line "OUTSIDE THE ROOT" is
//    the only thing separating this from §6's disclosure.
function staticMiddleware(root, opts = {}) {
  const { index = "index.html", dotfiles = "ignore", maxAge = 0, immutable = false } = opts;
  const rootResolved = path.resolve(root);

  return function serveStatic(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split("?")[0]); }
    catch { res.statusCode = 400; return res.end("bad path"); }

    // NOTE the two exclusions: '.' and '..' are traversal, not dotfiles, and
    // must fall through to the containment check below (§6) — not be quietly
    // ignored here, which would hide the attack instead of rejecting it.
    const isDotfile = (seg) => seg.startsWith(".") && seg !== "." && seg !== "..";
    if (dotfiles === "ignore" && urlPath.split("/").some(isDotfile)) {
      return next();                                   // .env, .git, .htaccess → invisible
    }

    let filePath = path.resolve(path.join(rootResolved, urlPath));

    // ───────────────── OUTSIDE THE ROOT ─────────────────
    if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
      res.statusCode = 403;
      return res.end("forbidden");
    }
    // ────────────────────────────────────────────────────

    let stat;
    try { stat = fs.statSync(filePath); }
    catch { return next(); }                           // MISSING → fall through, not 404

    if (stat.isDirectory()) {
      if (!index) return next();
      filePath = path.join(filePath, index);
      try { stat = fs.statSync(filePath); } catch { return next(); }
    }

    const etag = fileEtag(stat);
    res.setHeader("content-type", MIME[path.extname(filePath)] || "application/octet-stream");
    res.setHeader("content-length", stat.size);
    res.setHeader("last-modified", stat.mtime.toUTCString());
    res.setHeader("etag", etag);
    res.setHeader("cache-control",
      "public, max-age=" + Math.floor(maxAge / 1000) + (immutable ? ", immutable" : ""));

    const inm = req.headers["if-none-match"];
    const ims = req.headers["if-modified-since"];
    const notModified =
      (inm && inm === etag) ||
      (!inm && ims && new Date(ims).getTime() >= Math.floor(stat.mtimeMs / 1000) * 1000);

    if (notModified) {
      res.statusCode = 304;
      res.removeHeader("content-type");
      res.removeHeader("content-length");
      return res.end();
    }

    if (req.method === "HEAD") return res.end();
    // Streamed, not read into memory — a 2 GB file must not become a 2 GB
    // Buffer (2B.1 · 02_streams-and-buffers/07).
    fs.createReadStream(filePath).pipe(res);
  };
}

// ❌ The version in every "serve static files in Node" blog post.
function naiveStatic(root) {
  return function serveNaive(req, res, next) {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const filePath = path.join(root, urlPath);         // 🐛 join, then trust it
    let stat;
    try { stat = fs.statSync(filePath); } catch { return next(); }
    if (stat.isDirectory()) return next();
    res.setHeader("content-type", MIME[path.extname(filePath)] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(pathOrFn, maybeFn) {
      const mount = typeof pathOrFn === "string" ? pathOrFn : "/";
      const fn = typeof pathOrFn === "string" ? maybeFn : pathOrFn;
      stack.push({ mount, fn });
      return app;
    },
    get(p, fn) { stack.push({ mount: p, fn, exact: true, method: "GET" }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          req.originalUrl = req.url;
          let i = 0;
          (function next() {
            const layer = stack[i++];
            if (!layer) { res.statusCode = 404; return res.end("Cannot GET " + req.originalUrl); }
            const urlPath = req.url.split("?")[0];
            if (layer.exact) {
              if (layer.method !== req.method || layer.mount !== urlPath) return next();
              return layer.fn(req, res, next);
            }
            if (layer.mount !== "/" &&
                !(urlPath === layer.mount || urlPath.startsWith(layer.mount + "/"))) return next();
            const saved = req.url;
            if (layer.mount !== "/") req.url = req.url.slice(layer.mount.length) || "/";   // 04 §4
            layer.fn(req, res, (e) => { req.url = saved; next(e); });
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

function request(port, rawPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: rawPath, method: opts.method || "GET", headers: opts.headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, body: buf.toString("utf8"), bytes: buf.length });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — SERVING, AND THE FALLTHROUGH NOBODY EXPECTS
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — what static answers, and what it declines ══\n");

  let routeHits = 0;
  const app = miniExpress();
  app.use("/static", staticMiddleware(ROOT));
  app.get("/static/missing.js", (req, res) => { routeHits++; res.end("route answered instead"); });

  const { server, port } = await app.listen();

  const rows = {};
  for (const p of ["/static/index.html", "/static/app.js", "/static/style.css",
                   "/static/data.json", "/static/", "/static/sub/", "/static/nope.png"]) {
    const r = await request(port, p);
    rows[p] = { status: r.status, type: r.headers["content-type"], body: r.body.slice(0, 24), bytes: r.bytes };
  }
  const shadowed = await request(port, "/static/missing.js");
  server.close();

  results.serveRows = rows;
  results.fallthroughRouteHits = routeHits;
  results.fallthroughBody = shadowed.body;

  console.log("  url                     status  content-type                       body");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  for (const [p, v] of Object.entries(rows)) {
    console.log("  " + p.padEnd(24) + String(v.status).padEnd(8) +
      String(v.type ?? "—").padEnd(35) + JSON.stringify(v.body));
  }
  console.log("\n  GET /static/missing.js →", shadowed.status, JSON.stringify(shadowed.body));
  console.log("  route handler invocations:", routeHits);
  console.log("\n  Three facts in that table:");
  console.log("   • Content-Type comes from the FILE EXTENSION, nothing else. Rename");
  console.log("     app.js to app.txt and browsers stop executing it.");
  console.log("   • A directory serves index.html. '/static/' and '/static/sub/' both");
  console.log("     resolved to one.");
  console.log("   • A missing file is NOT answered by static. It called next(), and a");
  console.log("     route below it answered — static declines, it does not 404.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — POSITION DECIDES WHO OWNS THE URL
// ══════════════════════════════════════════════════════════════════
//
// 01 §4 proved order is the API for auth. Here it is again with a file on
// disk and a route competing for the same path — a real conflict in any app
// that has both a build output and an API.

async function section5() {
  console.log("\n══ § 5 — static above vs below the routes ══\n");

  const staticFirst = miniExpress();
  staticFirst.use(staticMiddleware(ROOT));
  staticFirst.get("/data.json", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end('{"from":"route"}');
  });

  const routeFirst = miniExpress();
  routeFirst.get("/data.json", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end('{"from":"route"}');
  });
  routeFirst.use(staticMiddleware(ROOT));

  const a = await staticFirst.listen();
  const b = await routeFirst.listen();
  const sFirst = await request(a.port, "/data.json");
  const rFirst = await request(b.port, "/data.json");
  const stillWorks = await request(b.port, "/app.js");
  a.server.close();
  b.server.close();

  results.staticFirstBody = sFirst.body;
  results.routeFirstBody = rFirst.body;
  results.routeFirstOtherFile = stillWorks.status;

  console.log("  static registered FIRST → GET /data.json:", sFirst.body, " ← the FILE won");
  console.log("  route  registered FIRST → GET /data.json:", rFirst.body, " ← the ROUTE won");
  console.log("  …and with the route first, /app.js still served:", stillWorks.status);
  console.log("\n  Identical files, identical routes, one line reordered. The practical");
  console.log("  guidance most codebases converge on:");
  console.log("   • Mount static under an explicit prefix ('/static', '/assets') so the");
  console.log("     collision can't happen in the first place.");
  console.log("   • If you serve from '/', put API routes ABOVE static so an API path");
  console.log("     can never be shadowed by a file someone dropped into the build.");
  console.log("   • Keep an SPA's index.html fallback BELOW everything — it must be the");
  console.log("     last resort, or it swallows your 404s.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — PATH TRAVERSAL, EXECUTED
// ══════════════════════════════════════════════════════════════════
//
// 06 §8 proved a URL-encoded '../' survives decoding into a value. Here is
// what that value does when it reaches path.join.

async function section6() {
  console.log("\n══ § 6 — the traversal, and the four lines that stop it ══\n");

  const unsafe = miniExpress();
  unsafe.use(naiveStatic(ROOT));

  const safe = miniExpress();
  safe.use(staticMiddleware(ROOT));

  const u = await unsafe.listen();
  const s = await safe.listen();

  const attack = "/%2E%2E%2Fsecrets.txt";            // decodes to ../secrets.txt
  const attackPlain = "/..%2Fsecrets.txt";

  const uHit = await request(u.port, attack);
  const uHit2 = await request(u.port, attackPlain);
  const sHit = await request(s.port, attack);
  const sNormal = await request(s.port, "/app.js");

  u.server.close();
  s.server.close();

  results.traversalNaive = { status: uHit.status, body: uHit.body };
  results.traversalNaiveAlt = { status: uHit2.status, body: uHit2.body };
  results.traversalSafe = { status: sHit.status, body: sHit.body };
  results.safeStillServes = sNormal.status;

  console.log("  GET " + attack);
  console.log("    naive join  →", uHit.status, JSON.stringify(uHit.body), " 🐛 file from OUTSIDE the root");
  console.log("    safe        →", sHit.status, JSON.stringify(sHit.body), " ✅");
  console.log("  GET " + attackPlain);
  console.log("    naive join  →", uHit2.status, JSON.stringify(uHit2.body), " 🐛 same result, different encoding");
  console.log("  GET /app.js (safe server) →", sNormal.status, " ✅ normal files unaffected");
  console.log("\n  The naive version is four characters short of correct. It does:");
  console.log("      path.join(root, urlPath)          🐛 join NORMALISES '..' happily");
  console.log("  The safe version does:");
  console.log("      const p = path.resolve(path.join(root, urlPath));");
  console.log("      if (p !== root && !p.startsWith(root + path.sep)) → 403");
  console.log("\n  Three things that make this worse than it looks:");
  console.log("   1. The encoding is a decoy. %2E%2E%2F, ..%2F and plain ../ all reach");
  console.log("      the same string after decoding — filtering on the literal '../'");
  console.log("      in the raw URL blocks none of them.");
  console.log("   2. startsWith(root) alone is NOT enough: '/srv/app-secrets' starts");
  console.log("      with '/srv/app'. The separator in `root + path.sep` is the fix.");
  console.log("   3. Symlinks can point outside the root even when the path check");
  console.log("      passes. If untrusted users can create files in the served");
  console.log("      directory, resolve the REAL path (fs.realpathSync) and check that.");
  console.log("\n  This is why you use express.static and not a hand-rolled loop. The");
  console.log("  point of writing the naive one here is to see that the vulnerability");
  console.log("  is the DEFAULT, and safety is the thing you have to add.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — CACHING: THE 304, AND WHY max-age IS THE REAL WIN
// ══════════════════════════════════════════════════════════════════

async function section7() {
  console.log("\n══ § 7 — revalidation vs never asking again ══\n");

  const defaults = miniExpress();
  defaults.use(staticMiddleware(ROOT));

  const hashed = miniExpress();
  hashed.use("/immutable", staticMiddleware(ROOT, { maxAge: 31536000000, immutable: true }));

  const d = await defaults.listen();
  const h = await hashed.listen();

  const first = await request(d.port, "/app.js");
  const revalidated = await request(d.port, "/app.js", { headers: { "if-none-match": first.headers.etag } });
  const byDate = await request(d.port, "/app.js", { headers: { "if-modified-since": first.headers["last-modified"] } });
  const immutableRes = await request(h.port, "/immutable/app.js");

  d.server.close();
  h.server.close();

  results.cacheFirst = { status: first.status, bytes: first.bytes, cc: first.headers["cache-control"] };
  results.cacheRevalidated = { status: revalidated.status, bytes: revalidated.bytes };
  results.cacheByDate = { status: byDate.status, bytes: byDate.bytes };
  results.cacheImmutable = immutableRes.headers["cache-control"];

  console.log("  1st GET /app.js                     →", first.status, first.bytes, "bytes");
  console.log("     cache-control:", first.headers["cache-control"]);
  console.log("     etag         :", first.headers.etag);
  console.log("     last-modified:", first.headers["last-modified"]);
  console.log("  2nd, If-None-Match                  →", revalidated.status, revalidated.bytes, "bytes");
  console.log("  3rd, If-Modified-Since              →", byDate.status, byDate.bytes, "bytes");
  console.log("  /immutable/app.js cache-control     :", immutableRes.headers["cache-control"]);
  console.log("\n  Both validators work, and both still cost a full round trip. That is");
  console.log("  the distinction worth stating in an interview:");
  console.log("   • max-age=0 (the default) → the browser ASKS every time. A 304 is");
  console.log("     cheap in bytes and expensive in latency: 40 assets = 40 round trips.");
  console.log("   • max-age=31536000, immutable → the browser does not ask at all until");
  console.log("     the year is up. Zero requests.");
  console.log("\n  You can only do the second safely if the URL changes when the content");
  console.log("  changes — app.4f2a9c.js — which is exactly what a bundler's content");
  console.log("  hashing is for. Hashed filenames: one year, immutable. index.html:");
  console.log("  no-cache, because it is the thing that points at the hashed names.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE ONE-LINE DISASTER
// ══════════════════════════════════════════════════════════════════
//
// No traversal, no attack, no unusual encoding. Just the wrong root.

async function section8() {
  console.log("\n══ § 8 — express.static pointed one directory too high ══\n");

  const correct = miniExpress();
  correct.use(staticMiddleware(ROOT));                          // ✅ the build output

  const tooHigh = miniExpress();
  tooHigh.use(staticMiddleware(TMP));                           // 🐛 the whole project dir

  const dotsAllowed = miniExpress();
  dotsAllowed.use(staticMiddleware(ROOT, { dotfiles: "allow" })); // 🐛 someone "fixed" a bug

  const c = await correct.listen();
  const t = await tooHigh.listen();
  const da = await dotsAllowed.listen();

  const secretViaRoot = await request(t.port, "/secrets.txt");
  const secretBlocked = await request(c.port, "/secrets.txt");
  const dotIgnored = await request(c.port, "/.env");
  const dotServed = await request(da.port, "/.env");

  c.server.close(); t.server.close(); da.server.close();

  results.rootTooHigh = { status: secretViaRoot.status, body: secretViaRoot.body };
  results.rootCorrect = { status: secretBlocked.status };
  results.dotIgnored = { status: dotIgnored.status };
  results.dotServed = { status: dotServed.status, body: dotServed.body };

  console.log("  static(TMP)   GET /secrets.txt →", secretViaRoot.status, JSON.stringify(secretViaRoot.body), " 🐛");
  console.log("  static(ROOT)  GET /secrets.txt →", secretBlocked.status, " ✅ not under the root at all");
  console.log("  static(ROOT)  GET /.env        →", dotIgnored.status, " ✅ dotfiles ignored by default");
  console.log("  dotfiles:'allow' GET /.env     →", dotServed.status, JSON.stringify(dotServed.body), " 🐛");
  console.log("\n  Nothing in the first line is a vulnerability in Express. The");
  console.log("  middleware did exactly what it was told: serve this directory. The");
  console.log("  directory was wrong.");
  console.log("\n  Real-world shapes of this exact mistake:");
  console.log("     app.use(express.static(__dirname))          ← ships your source");
  console.log("     app.use(express.static('.'))                ← .env, .git, node_modules");
  console.log("     app.use(express.static(path.join(__dirname, '..')))  ← the repo");
  console.log("\n  The default dotfiles:'ignore' is a seatbelt, not a fix — it hides");
  console.log("  .env and .git and nothing else. package.json, backup.sql and");
  console.log("  config.yaml have no leading dot. Point static at a directory that");
  console.log("  contains ONLY things you would publish, and the question stops");
  console.log("  mattering.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Source code, .env or .git served publicly because static was
//   pointed at __dirname or the repo root. → §8
//
// Bug 2 — Path traversal in a hand-rolled file server: path.join with no
//   containment check. → §6
//
// Bug 3 — A traversal filter that greps for '../' in the raw URL and misses
//   %2E%2E%2F. → §6
//
// Bug 4 — startsWith(root) without the trailing separator, so '/srv/app'
//   also accepts '/srv/app-secrets'. → §6
//
// Bug 5 — An API route shadowed by a file of the same name in the build
//   output, or vice versa. → §5
//
// Bug 6 — An SPA index.html fallback registered too high, swallowing every
//   API 404 and returning HTML to a fetch() that expected JSON. → §5
//
// Bug 7 — "Static returns 404 instead of my custom 404 page." It doesn't
//   404 at all — it fell through, and something below produced the 404. → §4
//
// Bug 8 — Assets revalidating on every page load because max-age is 0 by
//   default: dozens of 304 round trips per navigation. → §7
//
// Bug 9 — A long max-age on NON-hashed filenames, so a deploy doesn't reach
//   users for a year and there is no way to force it. → §7
//
// Bug 10 — Serving a large file by reading it into a Buffer instead of
//   streaming, turning one download into memory proportional to file size.
//   → 2B.1 · 02_streams-and-buffers/07
//
// Bug 11 — Static mounted above the rate limiter or auth, so unauthenticated
//   traffic gets unlimited file serving. → 12_rate-limiting-express-rate-limit.js


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — serving and fallthrough:
  const rows = results.serveRows;
  assert.equal(rows["/static/index.html"].status, 200);
  assert.ok(rows["/static/index.html"].type.startsWith("text/html"), "…served as text/html from the extension ✅");
  assert.ok(rows["/static/app.js"].type.startsWith("text/javascript"), "…and .js as text/javascript");
  assert.ok(rows["/static/style.css"].type.startsWith("text/css"));
  assert.ok(rows["/static/data.json"].type.startsWith("application/json"));
  assert.equal(rows["/static/"].body, "<h1>home</h1>", "a directory served its index.html ✅");
  assert.equal(rows["/static/sub/"].body, "<h1>sub</h1>", "…including a nested one");
  assert.equal(results.fallthroughRouteHits, 1,
    "a MISSING file made static call next(), and the route below answered ✅");
  assert.equal(results.fallthroughBody, "route answered instead",
    "…so static declines rather than 404s 🐛 for anyone expecting a 404 from it");

  // § 5 — position:
  assert.equal(results.staticFirstBody, '{"from":"disk"}',
    "static registered first served the FILE for /data.json ✅");
  assert.equal(results.routeFirstBody, '{"from":"route"}',
    "…the identical app with the route first served the ROUTE 🐛/✅ — position decides");
  assert.equal(results.routeFirstOtherFile, 200, "…and other files were unaffected either way");

  // § 6 — traversal:
  assert.equal(results.traversalNaive.status, 200,
    "the naive join SERVED a file from outside the root 🐛");
  assert.ok(results.traversalNaive.body.includes("AWS_SECRET_ACCESS_KEY"),
    "…and its contents were a real secret 🐛");
  assert.equal(results.traversalNaiveAlt.status, 200,
    "…and a different encoding of the same attack worked identically 🐛");
  assert.equal(results.traversalSafe.status, 403,
    "the resolve-and-contain check rejected it with 403 ✅");
  assert.equal(results.safeStillServes, 200, "…while legitimate files kept working");

  // § 7 — caching:
  assert.equal(results.cacheFirst.status, 200);
  assert.ok(results.cacheFirst.bytes > 0);
  assert.equal(results.cacheFirst.cc, "public, max-age=0",
    "the DEFAULT is revalidate-every-time 🐛 for a production asset");
  assert.equal(results.cacheRevalidated.status, 304, "a matching ETag produced 304 ✅");
  assert.equal(results.cacheRevalidated.bytes, 0, "…with zero body bytes");
  assert.equal(results.cacheByDate.status, 304, "If-Modified-Since worked as a fallback validator ✅");
  assert.equal(results.cacheByDate.bytes, 0);
  assert.equal(results.cacheImmutable, "public, max-age=31536000, immutable",
    "…and hashed assets can skip the round trip entirely ✅");

  // § 8 — the wrong root:
  assert.equal(results.rootTooHigh.status, 200,
    "pointing static one directory too high served a file that was never meant to be public 🐛");
  assert.ok(results.rootTooHigh.body.includes("live-key"), "…contents included 🐛");
  assert.equal(results.rootCorrect.status, 404,
    "…while the correct root could not reach it at all ✅");
  assert.equal(results.dotIgnored.status, 404,
    "dotfiles are ignored by default, so /.env was invisible ✅");
  assert.equal(results.dotServed.status, 200,
    "…and dotfiles:'allow' served it, password and all 🐛");
  assert.ok(results.dotServed.body.includes("hunter2"));

  console.log("§10 — mini assertions passed for: express.static()");
  console.log("\n  The pair that captures it: a missing file returned the ROUTE below it,");
  console.log("  proving static falls through — and '/%2E%2E%2Fsecrets.txt' returned a");
  console.log("  live AWS key from a four-line-shorter implementation.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does express.static work?", answer:
//
//   "It's a middleware like any other. It decodes the request path, joins it
//    to the root directory you gave it, and if a readable file is there it
//    streams it back with a Content-Type derived from the extension, plus
//    Content-Length, Last-Modified and an ETag. If the file isn't there it
//    calls next() — which surprises people: static never produces the 404
//    itself, it just declines, and whatever is below it answers. A directory
//    serves its index.html.
//
//    Because it's an ordinary middleware, position decides who owns a URL. I
//    can show the same app with static above and below a route for the same
//    path, serving the file in one order and the route in the other. In
//    practice I mount it under an explicit prefix so the collision can't
//    happen, and if an SPA fallback exists it goes last, or it swallows
//    every API 404 and returns HTML to a fetch that wanted JSON.
//
//    The part I'd emphasise is the root. Everything under it is public. The
//    classic incident isn't a clever attack, it's express.static(__dirname),
//    which publishes source, package.json and .env. Dotfiles are ignored by
//    default, which hides .env and .git and nothing else — package.json and
//    backup.sql don't start with a dot.
//
//    And the reason to use the built-in rather than a hand-rolled loop is
//    traversal. path.join happily normalises '../', so a naive
//    implementation serves files outside the root — I can reproduce that
//    with %2E%2E%2F, which also shows why filtering the raw URL for '../'
//    catches nothing. The fix is to resolve the joined path and verify it's
//    still under root plus a separator; without the separator, '/srv/app'
//    also accepts '/srv/app-secrets'.
//
//    Last, caching. The default max-age is 0, so every asset revalidates on
//    every load — cheap in bytes, expensive in latency, forty assets is
//    forty round trips. Hashed filenames get max-age of a year plus
//    immutable so the browser stops asking, and index.html gets no-cache
//    because it's what points at the hashed names."
//
// The traversal reproduction and "the root is the whole security boundary"
// are what make this a senior answer instead of a configuration recital.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does static do when the file is missing?
// A1. Calls next(). It does not 404 (§4).
//
// Q2. Where does Content-Type come from?
// A2. The file extension, nothing else (§4).
//
// Q3. Should static go above or below your routes?
// A3. Whichever you choose wins the URL. Prefer a mount prefix; if serving
//     from '/', put API routes above (§5).
//
// Q4. Where does an SPA fallback go?
// A4. Last, below everything, or it swallows API 404s (§5).
//
// Q5. How does a path traversal attack work here?
// A5. '../' in the decoded path, which path.join normalises out of the
//     root (§6).
//
// Q6. Why is filtering '../' in the URL insufficient?
// A6. %2E%2E%2F and ..%2F decode to the same thing after the filter ran
//     (§6).
//
// Q7. Why is startsWith(root) not enough?
// A7. '/srv/app-secrets'.startsWith('/srv/app') is true. Add path.sep (§6).
//
// Q8. What about symlinks?
// A8. A path check can pass while the real file is outside. Use
//     fs.realpathSync when untrusted users can write into the directory (§6).
//
// Q9. What is the default Cache-Control?
// A9. max-age=0 — revalidate every time (§7).
//
// Q10. When is max-age=31536000, immutable safe?
// A10. Only when the filename changes with the content — content hashing
//      (§7).
//
// Q11. Does a 304 skip reading the file?
// A11. It skips sending the body; the stat still happened. It saves
//      bandwidth, not the round trip (§7, 08 §7).
//
// Q12. What does dotfiles:'ignore' protect?
// A12. Only names beginning with '.'. It is not a substitute for choosing
//      the right root (§8).
//
// Q13. Should Node serve static files in production at all?
// A13. It works, but a CDN or reverse proxy does it better: sendfile, range
//      requests, compression and TLS termination without occupying your
//      event loop.
//
// Q14. What about Range requests?
// A14. send (behind express.static) implements them, which is what makes
//      video seeking and resumable downloads work. A hand-rolled server
//      almost never does.
//
// Q15. Why must the file be streamed?
// A15. Reading it into a Buffer makes memory proportional to file size and
//      to concurrency → 2B.1 · 02_streams-and-buffers/07.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Missing file → ?
//   Back : next(). Static declines; it never 404s.
//
// Flashcard 2:
//   Front: Content-Type source?
//   Back : The file extension.
//
// Flashcard 3:
//   Front: Who wins, static or a route on the same path?
//   Back : Whichever was registered first.
//
// Flashcard 4:
//   Front: The traversal fix?
//   Back : path.resolve, then startsWith(root + path.sep), else 403.
//
// Flashcard 5:
//   Front: Why is '../' filtering useless?
//   Back : %2E%2E%2F decodes after the filter.
//
// Flashcard 6:
//   Front: Default Cache-Control?
//   Back : max-age=0 — a revalidation round trip per asset.
//
// Flashcard 7:
//   Front: Hashed asset caching?
//   Back : max-age=31536000, immutable.
//
// Flashcard 8:
//   Front: The one-line disaster?
//   Back : express.static(__dirname).
//
// Flashcard 9:
//   Front: dotfiles default?
//   Back : 'ignore' — hides .env/.git only.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "The root IS the security boundary — everything under it is
//          public, and traversal is what happens when you don't check you
//          stayed inside it."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add Range request support to staticMiddleware (206, Content-Range) and
//   prove a partial fetch of app.js returns only the requested bytes.
//
// Task 2:
//   Add a symlink inside ROOT pointing at TMP/secrets.txt and show the path
//   check passes. Then add fs.realpathSync and show it doesn't.
//
// Task 3:
//   Build the two-tier cache policy: hashed files immutable for a year,
//   index.html no-cache. Verify with two requests each.
//
// Task 4:
//   Add gzip: serve app.js.gz when the client sends Accept-Encoding: gzip,
//   with the right Content-Encoding and Vary headers.
//
// Task 5:
//   Write an SPA fallback and prove that mounting it above the API returns
//   HTML for /api/missing, and below it returns a JSON 404.
//
// Task 6:
//   Instrument staticMiddleware to count stat() calls per request, then
//   serve a page with 40 assets and total them. That number is the argument
//   for a CDN.
//
// Task 7:
//   Reproduce §6's traversal against a directory containing a fake
//   'id_rsa', then write the assertion you would add to CI so the fix can
//   never regress.
//
// Task 8:
//   Compare memory while downloading a 200 MB file with createReadStream
//   versus readFileSync, using the measurement technique from
//   2B.1 · 02_streams-and-buffers/07.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   express.static is an ordinary middleware that maps URLs onto a directory
//   and calls next() when the file isn't there — and the root you give it is
//   the entire security boundary.
//
// If you remember the common bug:
//   express.static(__dirname), which publishes your source and .env — and
//   in hand-rolled versions, path.join with no containment check, which
//   serves anything '../' can reach.
//
// If you remember the professional framing:
//   A dedicated build directory, an explicit mount prefix, API routes above
//   it, SPA fallback last, hashed filenames with immutable caching, and a
//   CDN in front of it in production.
//
// ─────────────────────────────────────────────────────────────────
// Everything served so far has been requested by the same origin that served
// it. The moment a browser on a different origin makes that request, a rule
// none of these files has mentioned takes over — and it is enforced by the
// browser, not by Express.
//
// NEXT TOPIC -> 10_cors-setup.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  try {
    await section4();
    await section5();
    await section6();
    await section7();
    await section8();
    assertions();
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log("\n  (temporary fixture directory removed)");
  }
})();
