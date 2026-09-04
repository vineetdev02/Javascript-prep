// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  06_route-params-vs-query-params.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Route params vs query params
//
// WHAT YOU WILL MASTER HERE:
//   1. The structural difference: route params are captured BY the route
//      pattern and take part in matching; query params are invisible to
//      matching and are parsed off the end of the URL
//   2. Both printed side by side from one handler, plus req.path,
//      req.url and req.originalUrl for the same request
//   3. The fact that causes the most bugs: EVERY value from either source is
//      a string — proven with a pagination bug that produces page "21"
//   4. Query parsing edge cases, measured: repeated keys become arrays,
//      a bare key becomes '', '+' becomes a space, and 'extended' parsing
//      turns a[b]=c into a nested object
//   5. The security consequence of #4: ?user[$ne]= arriving as an OBJECT in
//      the exact place your code expected a string
//   6. Optional params, wildcards, and why %2F can never appear inside one
//      path segment
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/06_route-params-vs-query-params.js"
//
// Prerequisites: 05_express-router.js §3 (the matcher that produces
// req.params) and §7 (mergeParams). This file examines the values that
// matcher has been producing, and the entirely separate mechanism that fills
// req.query.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Route params vs query params:
// route params (req.params) are segments of the PATH captured by the route
// pattern — '/users/:id' against /users/7 gives { id: '7' } — and a request
// that doesn't have them doesn't match the route at all; query params
// (req.query) are the key/value pairs after '?', parsed from the URL,
// completely ignored during route matching.
//
// If interviewer says "explain it simply", say:
//   "Route params identify WHICH resource. Query params modify HOW you want
//    it — filtering, sorting, pagination, format. A route param is part of
//    the address, so /users/7 and /users/8 are different resources. A query
//    param is a modifier on one address, so /users?sort=name and
//    /users?sort=age are the same collection viewed two ways."
//
// If interviewer says "how do they differ mechanically?", say:
//   "Matching. The router compiles '/users/:id' into a regex; :id is a
//    capture group, so the value is a by-product of deciding whether the
//    route matched. The query string never reaches that regex — Express
//    splits it off first. That's why a route defined as '/users' happily
//    serves /users?anything=you&want, and why you can't 'route on' a query
//    param without writing a middleware to do it yourself."
//
// Why it matters in interviews:
//   The answer people give is a definition. The answer that lands adds the
//   two runtime facts underneath it: everything is a string, and req.query
//   values are not guaranteed to be strings at all — they can arrive as
//   arrays or objects chosen by the caller.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   PARAMS IDENTIFY. QUERY MODIFIES. BOTH ARRIVE AS UNTRUSTED STRINGS —
//   OR WORSE.
//
// Runtime rule:
//   req.params comes from capture groups in the compiled route regex and is
//   REPLACED per layer. req.query is parsed once from everything after the
//   first '?' and never affects which route runs. Both are URL-decoded.
//
// Practical rule:
//   Identity in the path, modifiers in the query. Coerce and validate at the
//   edge — one place, before any handler logic — and after that point treat
//   the values as the types you declared, never as "probably a number".
//
// Common trap:
//   Assuming req.query.x is a string. Add a second x to the URL and it is
//   an array; use bracket syntax and it is an object. Your .trim() throws
//   or, far worse, your database query changes shape (§7).
//
// The mental picture:
//
//   GET /api/users/7/posts?tag=js&tag=node&page=2#top
//       └──────┬──────┘        └────────┬────────┘
//         matched by                parsed into
//     '/users/:id/posts'              req.query
//     → req.params = {id:'7'}     → { tag:['js','node'], page:'2' }
//
//   The '#top' fragment never leaves the browser — the server never sees it.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE TWO MECHANISMS, SIDE BY SIDE
// ══════════════════════════════════════════════════════════════════
//
// Two independent pieces of code. The matcher produces params; the query
// parser produces query. They never consult each other.

function makeMatcher(path, { end = true, strict = false, caseSensitive = false } = {}) {
  if (!end && path === "/") return () => ({ params: {}, matched: "" });

  const keys = [];
  let source = "^";
  const segments = path.split("/").filter(Boolean);

  for (const seg of segments) {
    if (seg === "*") { keys.push("0"); source += "/(.*)"; continue; }
    if (seg[0] === ":") {
      const optional = seg.endsWith("?");
      keys.push(seg.slice(1, optional ? -1 : undefined));
      source += optional ? "(?:/([^/]+))?" : "/([^/]+)";
      continue;
    }
    source += "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  if (!segments.length) source += "/";
  source += end ? (strict ? "$" : "/?$") : "(?=/|$)";

  const re = new RegExp(source, caseSensitive ? "" : "i");

  return (urlPath) => {
    const m = re.exec(urlPath);
    if (!m) return null;
    const params = {};
    keys.forEach((k, idx) => {
      const raw = m[idx + 1];
      // Values are URL-DECODED here. That is why %2F cannot smuggle a slash
      // into a segment: [^/] rejected it before decoding ever happened (§8).
      params[k] = raw === undefined ? undefined : decodeURIComponent(raw);
    });
    return { params, matched: m[0] };
  };
}

// Express's two query parsers. 'simple' is Node's querystring; 'extended'
// is the qs library, which understands bracket syntax. Express 4 defaults to
// extended; Express 5 defaults to simple.
function parseQuery(qs, mode = "extended") {
  const out = {};
  if (!qs) return out;

  const dec = (s) => decodeURIComponent(s.replace(/\+/g, " "));

  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = dec(eq === -1 ? pair : pair.slice(0, eq));
    const val = eq === -1 ? "" : dec(pair.slice(eq + 1));

    if (mode === "extended") {
      const bracket = /^([^[\]]+)\[([^[\]]*)\]$/.exec(key);
      if (bracket) {
        const [, base, sub] = bracket;
        if (sub === "") { (out[base] ||= []).push(val); continue; }   // a[]=1&a[]=2
        if (typeof out[base] !== "object" || Array.isArray(out[base])) out[base] = {};
        out[base][sub] = val;                                          // a[b]=c
        continue;
      }
    }

    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = Array.isArray(out[key]) ? [...out[key], val] : [out[key], val];
    } else {
      out[key] = val;
    }
  }
  return out;
}

function miniExpress({ queryParser = "extended" } = {}) {
  const stack = [];
  const app = {
    use(fn) { stack.push({ kind: "fn", handler: fn, match: makeMatcher("/", { end: false }) }); return app; },
    get(path, fn) { stack.push({ kind: "route", method: "GET", handler: fn, match: makeMatcher(path) }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const qIndex = req.url.indexOf("?");
          req.originalUrl = req.url;
          req.path = qIndex === -1 ? req.url : req.url.slice(0, qIndex);
          req.query = parseQuery(qIndex === -1 ? "" : req.url.slice(qIndex + 1), queryParser);
          req.params = {};

          let i = 0;
          (function next() {
            const layer = stack[i++];
            if (!layer) { res.statusCode = 404; return res.end("Cannot " + req.method + " " + req.path); }
            if (layer.method && layer.method !== req.method) return next();
            const m = layer.match(req.path);        // ← matching uses req.path, NOT req.url
            if (!m) return next();
            req.params = m.params;
            try { layer.handler(req, res, next); } catch (e) { res.statusCode = 500; res.end("ERR: " + e.message); }
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const json = (res, obj) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
};


// ══════════════════════════════════════════════════════════════════
// § 4 — ONE REQUEST, EVERY VIEW OF IT
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — params, query, path, url — from one request ══\n");

  const app = miniExpress();
  app.get("/users/:userId/posts/:postId", (req, res) => json(res, {
    params: req.params,
    query: req.query,
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
  }));
  app.get("/users", (req, res) => json(res, { matched: "/users", query: req.query }));

  const { server, port } = await app.listen();
  const detailed = JSON.parse((await request(port, "/users/7/posts/99?tag=js&page=2")).body);
  const bare     = JSON.parse((await request(port, "/users?anything=you&want=here")).body);
  const noQuery  = JSON.parse((await request(port, "/users/7/posts/99")).body);
  server.close();

  results.viewsDetailed = detailed;
  results.viewsBare = bare;
  results.noQueryIsEmptyObject = Object.keys(noQuery.query).length === 0;

  console.log("  GET /users/7/posts/99?tag=js&page=2");
  console.log("    req.params      :", JSON.stringify(detailed.params));
  console.log("    req.query       :", JSON.stringify(detailed.query));
  console.log("    req.path        :", JSON.stringify(detailed.path), "  ← query stripped");
  console.log("    req.url         :", JSON.stringify(detailed.url), "  ← query INCLUDED");
  console.log("    req.originalUrl :", JSON.stringify(detailed.originalUrl));
  console.log("\n  GET /users?anything=you&want=here");
  console.log("    matched route   :", JSON.stringify(bare.matched), " ← the query changed nothing");
  console.log("    req.query       :", JSON.stringify(bare.query));
  console.log("\n  GET /users/7/posts/99   (no query at all)");
  console.log("    req.query       : {} — an empty OBJECT, never undefined");
  console.log("\n  Two rules fall out of this:");
  console.log("   • Matching runs against req.path. You cannot route on a query param;");
  console.log("     '/users' serves every possible query string that follows it.");
  console.log("   • req.query is always an object, so `req.query.missing` is undefined");
  console.log("     rather than a crash — which is exactly why missing query params");
  console.log("     fail silently and route params cannot (a missing one = no match).");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — EVERYTHING IS A STRING
// ══════════════════════════════════════════════════════════════════
//
// HTTP has no types. A URL is text. Both req.params and req.query hand you
// text, and JavaScript's willingness to coerce hides that fact until the one
// operator that concatenates instead of adding.

async function section5() {
  console.log("\n══ § 5 — every value is a string ══\n");

  const app = miniExpress();

  app.get("/items/:id", (req, res) => {
    const id = req.params.id;
    const page = req.query.page ?? "1";
    json(res, {
      idType: typeof id,
      idValue: id,
      idStrictEqualsNumber: id === 7,          // false, always
      idLooseEqualsNumber: id == 7,            // true — the trap that hides it
      pageType: typeof page,
      nextPageWrong: page + 1,                 // 🐛 concatenation
      nextPageRight: Number(page) + 1,         // ✅
      offsetAccidentallyWorks: (page - 1) * 10, // '-' coerces, '+' does not
    });
  });

  const { server, port } = await app.listen();
  const r = JSON.parse((await request(port, "/items/7?page=2")).body);
  const padded = JSON.parse((await request(port, "/items/007?page=2")).body);
  server.close();

  results.stringy = r;
  results.paddedId = padded.idValue;

  console.log("  GET /items/7?page=2");
  console.log("    typeof req.params.id        :", r.idType);
  console.log("    req.params.id === 7         :", r.idStrictEqualsNumber, " ← always false");
  console.log("    req.params.id == 7          :", r.idLooseEqualsNumber, "  ← the trap: == hides it");
  console.log("    page + 1                    :", JSON.stringify(r.nextPageWrong), "🐛 concatenation");
  console.log("    Number(page) + 1            :", r.nextPageRight, " ✅");
  console.log("    (page - 1) * 10             :", r.offsetAccidentallyWorks,
              " ← works by accident: '-' coerces, '+' doesn't");
  console.log("\n  GET /items/007");
  console.log("    req.params.id               :", JSON.stringify(results.paddedId),
              " ← '007' !== '7', two cache keys for one row");
  console.log("\n  This is the single most common Express bug and it is not an Express");
  console.log("  bug at all: `?page=2` gives you the string '2', `page - 1` silently");
  console.log("  works, so nobody converts anything, and then `page + 1` produces '21'");
  console.log("  and a pagination link that jumps to page twenty-one.");
  console.log("\n  ✅ Rule: coerce once, at the edge:");
  console.log("       const page = Math.max(1, parseInt(req.query.page, 10) || 1);");
  console.log("     …and note `|| 1` also handles 'abc', which parseInt makes NaN.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — QUERY PARSING IS NOT THE OBVIOUS ALGORITHM
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — what the query parser actually produces ══\n");

  const cases = [
    "?tag=js",
    "?tag=js&tag=node",
    "?flag",
    "?empty=",
    "?q=hello+world",
    "?q=hello%20world",
    "?q=a%26b",
    "?filter[status]=open",
    "?ids[]=1&ids[]=2",
    "?a=1&a=2&a=3",
  ];

  const app = miniExpress({ queryParser: "extended" });
  app.get("/q", (req, res) => json(res, req.query));
  const ext = await app.listen();

  const appSimple = miniExpress({ queryParser: "simple" });
  appSimple.get("/q", (req, res) => json(res, req.query));
  const simp = await appSimple.listen();

  const table = {};
  for (const qs of cases) {
    table[qs] = {
      extended: JSON.parse((await request(ext.port, "/q" + qs)).body),
      simple: JSON.parse((await request(simp.port, "/q" + qs)).body),
    };
  }
  ext.server.close();
  simp.server.close();

  results.queryTable = table;

  console.log("  query string                  extended (Express 4 default)      simple (Express 5)");
  console.log("  ───────────────────────────────────────────────────────────────────────────────────");
  for (const [qs, v] of Object.entries(table)) {
    console.log(
      "  " + qs.padEnd(30) +
      JSON.stringify(v.extended).padEnd(34) +
      JSON.stringify(v.simple)
    );
  }

  console.log("\n  Six things in that table people get wrong:");
  console.log("   1. ?tag=js&tag=node gives an ARRAY. Your handler expected a string.");
  console.log("   2. ?flag with no '=' gives '' — falsy. `if (req.query.flag)` is false");
  console.log("      for a flag the caller clearly set. Use `'flag' in req.query`.");
  console.log("   3. '+' means space. A base64 value in a query string loses its plus");
  console.log("      signs unless it was percent-encoded.");
  console.log("   4. %26 decodes to '&' AFTER splitting, so encoded separators survive.");
  console.log("   5. filter[status]=open becomes a nested OBJECT under extended, and a");
  console.log("      key literally named 'filter[status]' under simple.");
  console.log("   6. Same URL, two Express versions, two different shapes. Express 5");
  console.log("      changed the default parser — that is a real migration hazard.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE SECURITY CONSEQUENCE: THE CALLER PICKS THE TYPE
// ══════════════════════════════════════════════════════════════════
//
// §6 was a curiosity. This is the reason it matters: the SHAPE of
// req.query.x is chosen by whoever wrote the URL, not by you.

async function section7() {
  console.log("\n══ § 7 — an attacker choosing your value's type ══\n");

  // A deliberately naive "database": it treats an object value as an
  // operator document, exactly like a MongoDB driver would.
  function findUser(criteria) {
    const users = [{ user: "alice", role: "user" }, { user: "root", role: "admin" }];
    return users.filter((u) =>
      Object.entries(criteria).every(([k, v]) => {
        if (v && typeof v === "object" && "$ne" in v) return u[k] !== v.$ne;   // operator!
        return u[k] === v;
      })
    );
  }

  const app = miniExpress({ queryParser: "extended" });

  app.get("/naive", (req, res) => {
    // 🐛 req.query.user is trusted to be a string. It is not.
    const found = findUser({ user: req.query.user });
    json(res, { count: found.length, users: found.map((u) => u.user) });
  });

  app.get("/guarded", (req, res) => {
    // ✅ coerce and reject anything that is not a plain string
    const user = req.query.user;
    if (typeof user !== "string") { res.statusCode = 400; return json(res, { error: "user must be a string" }); }
    const found = findUser({ user });
    json(res, { count: found.length, users: found.map((u) => u.user) });
  });

  app.get("/trim", (req, res) => {
    try { json(res, { trimmed: req.query.q.trim() }); }
    catch (e) { json(res, { crashed: e.constructor.name, message: e.message }); }
  });

  const { server, port } = await app.listen();
  const normal   = JSON.parse((await request(port, "/naive?user=alice")).body);
  const injected = JSON.parse((await request(port, "/naive?user[$ne]=nobody")).body);
  const guarded  = await request(port, "/guarded?user[$ne]=nobody");
  const trimOk   = JSON.parse((await request(port, "/trim?q=+hi+")).body);
  const trimBoom = JSON.parse((await request(port, "/trim?q=1&q=2")).body);
  server.close();

  results.injectionNormal = normal;
  results.injectionAttack = injected;
  results.injectionGuardedStatus = guarded.status;
  results.trimOk = trimOk;
  results.trimBoom = trimBoom;

  console.log("  GET /naive?user=alice          →", JSON.stringify(normal));
  console.log("  GET /naive?user[$ne]=nobody    →", JSON.stringify(injected), " 🐛 every user, admin included");
  console.log("  GET /guarded?user[$ne]=nobody  →", guarded.status, guarded.body, " ✅");
  console.log("\n  GET /trim?q=+hi+               →", JSON.stringify(trimOk));
  console.log("  GET /trim?q=1&q=2              →", JSON.stringify(trimBoom), " 🐛 array has no .trim()");
  console.log("\n  Nothing here is exotic. Two extra characters in a URL turned a string");
  console.log("  into an object, and a lookup meant to find one user returned all of");
  console.log("  them. The same two characters turn a validated string into an array");
  console.log("  and crash any handler that calls a string method on it.");
  console.log("\n  ✅ Three defences, in order of value:");
  console.log("     1. Validate shape at the edge — a schema (express-validator, zod,");
  console.log("        joi) that says 'user: string' and rejects everything else.");
  console.log("        → 17_express-validator.js");
  console.log("     2. Never pass a raw req.query value into a query document.");
  console.log("     3. Consider the 'simple' query parser if you never need nesting:");
  console.log("        app.set('query parser', 'simple') removes the object case.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — OPTIONAL PARAMS, WILDCARDS, AND THE SLASH THAT CANNOT PASS
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — optional params, wildcards, encoding ══\n");

  const app = miniExpress();
  app.get("/reports/:year/:month?", (req, res) => json(res, {
    year: req.params.year,
    month: req.params.month ?? null,
  }));
  app.get("/files/*", (req, res) => json(res, { rest: req.params["0"] }));
  app.get("/echo/:value", (req, res) => json(res, { value: req.params.value }));

  const { server, port } = await app.listen();
  const both    = JSON.parse((await request(port, "/reports/2026/08")).body);
  const yearOnly= JSON.parse((await request(port, "/reports/2026")).body);
  const deep    = JSON.parse((await request(port, "/files/a/b/c.txt")).body);
  const spaced  = JSON.parse((await request(port, "/echo/hello%20world")).body);
  const slashed = JSON.parse((await request(port, "/echo/a%2Fb")).body);
  const traversal = JSON.parse((await request(port, "/echo/%2E%2E%2Fetc%2Fpasswd")).body);
  const plussed = JSON.parse((await request(port, "/echo/a+b")).body);
  server.close();

  results.optBoth = both;
  results.optYearOnly = yearOnly;
  results.wildcard = deep;
  results.encodedSpace = spaced;
  results.encodedSlashValue = slashed.value;
  results.traversalValue = traversal.value;
  results.plusInPath = plussed;

  console.log("  /reports/2026/08   →", JSON.stringify(both));
  console.log("  /reports/2026      →", JSON.stringify(yearOnly), " ← optional param is undefined, not ''");
  console.log("  /files/a/b/c.txt   →", JSON.stringify(deep), " ← '*' captures across slashes");
  console.log("  /echo/hello%20world→", JSON.stringify(spaced), " ← decoded for you");
  console.log("  /echo/a%2Fb        →", JSON.stringify(slashed), " ← a param CONTAINING a slash 🐛");
  console.log("  /echo/%2E%2E%2Fetc%2Fpasswd →", JSON.stringify(traversal), " ← '../etc/passwd' 🐛");
  console.log("  /echo/a+b          →", JSON.stringify(plussed), " ← '+' is literal in a PATH");
  console.log("\n  The %2F line is the one worth remembering, and it is the opposite of");
  console.log("  what people guess. The segment matcher is [^/]+, but it runs against");
  console.log("  the RAW, still-encoded path — where %2F is three ordinary characters.");
  console.log("  It matches, and THEN the value is decoded. So a single-segment param");
  console.log("  can absolutely hand you a value containing '/', and '..' with it.");
  console.log("\n  Two consequences:");
  console.log("   • Any param you concatenate into a filesystem path is a traversal");
  console.log("     vector unless you resolve and re-check it. → 09_express-static.js §6");
  console.log("   • It is not portable. nginx and several load balancers normalise");
  console.log("     %2F to '/' before your app sees it, so the same URL that works");
  console.log("     locally 404s behind the proxy. If an id can contain '/', put it in");
  console.log("     the query string or base64url it — do not rely on %2F surviving.");
  console.log("\n  And note the last line: '+' means space in a QUERY string and a");
  console.log("  literal plus in a PATH. Same character, two rules, one URL.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Page 21. `page + 1` on the string '2'. Everything else in the
//   pagination code used '-' and '*', which coerce, so nobody noticed. → §5
//
// Bug 2 — Cache and DB misses on '007' vs '7'. Two strings, one row. → §5
//
// Bug 3 — `if (req.query.debug)` false for ?debug, because a bare key parses
//   to ''. Use `'debug' in req.query`. → §6
//
// Bug 4 — A base64 token in a query string arriving with spaces where its
//   '+' characters were. → §6
//
// Bug 5 — .trim()/.toLowerCase() throwing "is not a function" in production
//   because someone passed the same query key twice. → §7
//
// Bug 6 — NoSQL operator injection via ?user[$ne]= — a string parameter
//   arriving as an operator object. → §7
//
// Bug 7 — An Express 4 → 5 upgrade silently changing every bracket-syntax
//   query param from a nested object to a flat weird key. → §6
//
// Bug 8 — A route param that contains '/' or '..' because %2F matched the
//   raw path and decoded afterwards — then concatenated into a file path.
//   And the mirror image: the same URL 404ing behind nginx, which
//   normalises %2F before Express sees it. → §8
//
// Bug 9 — Treating an optional param's absence as '' instead of undefined,
//   then building '/reports/2026/' as a link. → §8
//
// Bug 10 — Trying to route on a query param ('/search?type=user' as a
//   route path). Matching never sees the query. → §4


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — the two mechanisms:
  assert.deepEqual(results.viewsDetailed.params, { userId: "7", postId: "99" },
    "route params came from the PATH pattern's capture groups ✅");
  assert.deepEqual(results.viewsDetailed.query, { tag: "js", page: "2" },
    "query params came from after the '?' ✅");
  assert.equal(results.viewsDetailed.path, "/users/7/posts/99", "req.path excludes the query string");
  assert.equal(results.viewsDetailed.url, "/users/7/posts/99?tag=js&page=2", "req.url includes it");
  assert.equal(results.viewsBare.matched, "/users",
    "a route with no params matched a URL carrying two query params — the query is invisible to matching ✅");
  assert.equal(results.noQueryIsEmptyObject, true, "no query string ⇒ req.query is {} , never undefined");

  // § 5 — everything is a string:
  assert.equal(results.stringy.idType, "string", "req.params.id is a STRING ✅");
  assert.equal(results.stringy.idStrictEqualsNumber, false, "…so === against a number is always false");
  assert.equal(results.stringy.idLooseEqualsNumber, true, "…while == coerces and hides the whole problem 🐛");
  assert.equal(results.stringy.nextPageWrong, "21",
    "page + 1 on the string '2' produced '21' — the pagination bug, reproduced 🐛");
  assert.equal(results.stringy.nextPageRight, 3, "…and Number(page) + 1 produced 3 ✅");
  assert.equal(results.stringy.offsetAccidentallyWorks, 10,
    "…while (page - 1) * 10 worked by accident, which is why nobody catches this early");
  assert.equal(results.paddedId, "007", "'007' stays '007' — a distinct string from '7' 🐛");

  // § 6 — query parsing:
  const q = results.queryTable;
  assert.deepEqual(q["?tag=js&tag=node"].extended, { tag: ["js", "node"] },
    "a repeated key produced an ARRAY, not a string 🐛");
  assert.deepEqual(q["?flag"].extended, { flag: "" },
    "a bare key produced '' — falsy, so `if (req.query.flag)` is false 🐛");
  assert.deepEqual(q["?q=hello+world"].extended, { q: "hello world" }, "'+' decoded to a space in the query");
  assert.deepEqual(q["?q=a%26b"].extended, { q: "a&b" }, "%26 survived the & split and decoded to '&'");
  assert.deepEqual(q["?filter[status]=open"].extended, { filter: { status: "open" } },
    "extended parsing turned bracket syntax into a nested OBJECT ✅");
  assert.deepEqual(q["?filter[status]=open"].simple, { "filter[status]": "open" },
    "…while the simple parser kept it as one flat, literal key — the Express 5 change 🐛");
  assert.deepEqual(q["?ids[]=1&ids[]=2"].extended, { ids: ["1", "2"] });
  assert.deepEqual(q["?a=1&a=2&a=3"].extended, { a: ["1", "2", "3"] });

  // § 7 — the security consequence:
  assert.deepEqual(results.injectionNormal, { count: 1, users: ["alice"] },
    "the honest request returned exactly one user");
  assert.deepEqual(results.injectionAttack, { count: 2, users: ["alice", "root"] },
    "?user[$ne]=nobody returned EVERY user including the admin — a string param arrived as an operator object 🐛");
  assert.equal(results.injectionGuardedStatus, 400,
    "…and a typeof-string check at the edge rejected the identical request ✅");
  assert.deepEqual(results.trimOk, { trimmed: "hi" });
  assert.equal(results.trimBoom.crashed, "TypeError",
    "duplicating a query key turned a string into an array and .trim() threw 🐛");

  // § 8 — optional params, wildcard, encoding:
  assert.deepEqual(results.optBoth, { year: "2026", month: "08" });
  assert.deepEqual(results.optYearOnly, { year: "2026", month: null },
    "an absent optional param is undefined, not '' ✅");
  assert.deepEqual(results.wildcard, { rest: "a/b/c.txt" }, "'*' captured across slashes ✅");
  assert.deepEqual(results.encodedSpace, { value: "hello world" }, "%20 was decoded into the param");
  assert.equal(results.encodedSlashValue, "a/b",
    "%2F MATCHED the [^/]+ segment (matching runs on the raw path) and then decoded into a slash 🐛");
  assert.equal(results.traversalValue, "../etc/passwd",
    "…so a single-segment param handed back '../etc/passwd' — a traversal vector if it touches the filesystem 🐛");
  assert.deepEqual(results.plusInPath, { value: "a+b" },
    "'+' stayed a literal plus in the PATH, unlike in the query string ✅");

  console.log("§10 — mini assertions passed for: Route params vs query params");
  console.log("\n  The pair that captures it: `page + 1` returning '21' proves every value");
  console.log("  is a string — and ?user[$ne]=nobody returning every user proves you are");
  console.log("  not even guaranteed a string.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between route params and query
// params?", answer:
//
//   "Route params are captured by the route pattern — '/users/:id' compiles
//    to a regex where :id is a capture group, so the value is a by-product
//    of deciding whether the route matched at all. Query params are
//    everything after the '?'; Express splits them off before matching, so
//    they never influence which route runs. That's why '/users' serves
//    /users?anything=you&want, and why you can't route on a query param
//    without writing your own middleware.
//
//    Semantically: params identify which resource, query modifies how you
//    want it — filter, sort, page, format. A missing route param means no
//    match, so it fails loudly; a missing query param is just undefined, so
//    it fails silently. That asymmetry is a design tool.
//
//    The runtime facts I actually care about are the two underneath. First,
//    everything is a string — HTTP has no types. `?page=2` gives '2', and
//    because `page - 1` and `page * 10` both coerce, nobody converts
//    anything until `page + 1` returns '21' and pagination jumps to page
//    twenty-one. I coerce once at the edge: parseInt with a fallback.
//
//    Second — and this is the one that's a security issue rather than a bug
//    — you aren't even guaranteed a string. Express 4's default query parser
//    is qs, so the CALLER chooses the type: a repeated key gives you an
//    array, and bracket syntax gives you an object. So ?user=alice is a
//    string but ?user[$ne]=nobody is { $ne: 'nobody' }, and if that goes
//    into a Mongo query unvalidated, a lookup for one user returns every
//    user. The same trick turns a validated string into an array and makes
//    .trim() throw in production. The fix is schema validation at the edge,
//    not a typeof check scattered through handlers — and it's worth knowing
//    Express 5 switched the default parser to the simple one, which changes
//    the shape of every bracket-syntax param on upgrade."
//
// Ending on the injection example moves this from a definition question to
// a security answer, which is usually not what the interviewer expected.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Which one takes part in route matching?
// A1. Route params only. The query is split off first (§4).
//
// Q2. req.path vs req.url vs req.originalUrl?
// A2. path = no query; url = path + query, rewritten by mounts;
//     originalUrl = the untouched full path + query (§4, 04 §4).
//
// Q3. What type is req.params.id?
// A3. Always a string (§5).
//
// Q4. Why does (page - 1) work but (page + 1) not?
// A4. '-' has only a numeric meaning, so it coerces; '+' is also string
//     concatenation, so it doesn't (§5).
//
// Q5. What does ?tag=a&tag=b give you?
// A5. An array (§6).
//
// Q6. What does ?flag (no '=') give you?
// A6. The empty string — falsy. Test with `'flag' in req.query` (§6).
//
// Q7. What is the 'extended' query parser?
// A7. qs, which understands bracket syntax and produces nested objects and
//     arrays. Express 4's default; Express 5 defaults to simple (§6).
//
// Q8. How does ?user[$ne]= become an attack?
// A8. It arrives as an object; passed into a document-database query it
//     becomes an operator instead of a value (§7).
//
// Q9. How do you defend?
// A9. Validate shape at the edge with a schema, never pass raw query values
//     into a query document, and consider the simple parser (§7).
//
// Q10. Can a route param contain a slash?
// A10. Yes, via %2F. Matching runs on the RAW path where %2F is three
//      ordinary characters, so [^/]+ matches, and decoding happens after —
//      you get 'a/b'. Don't rely on it (proxies normalise it), and never
//      trust it near a filesystem (§8).
//
// Q11. How do you capture the rest of a path?
// A11. A wildcard route ('/files/*'), which captures across slashes (§8).
//
// Q12. '+' in a path vs in a query?
// A12. Literal plus in a path; a space in a query string (§8).
//
// Q13. Is the URL fragment (#top) available on the server?
// A13. No. Browsers never send it.
//
// Q14. Where should an API version live — path or query?
// A14. Path, because it identifies a different contract, not a view of the
//      same one → 2B.3 API versioning strategies.
//
// Q15. Filtering: query or path?
// A15. Query. A filter is a view of a collection; putting it in the path
//      invents a new resource for every combination.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Which affects route matching?
//   Back : Route params. The query is split off before matching.
//
// Flashcard 2:
//   Front: Semantic split?
//   Back : Params identify the resource; query modifies the view.
//
// Flashcard 3:
//   Front: typeof req.query.page?
//   Back : 'string' — or 'object' if the caller repeats or brackets it.
//
// Flashcard 4:
//   Front: '2' + 1?
//   Back : '21'. The pagination bug.
//
// Flashcard 5:
//   Front: ?flag with no value?
//   Back : '' — falsy. Use `'flag' in req.query`.
//
// Flashcard 6:
//   Front: ?tag=a&tag=b?
//   Back : ['a','b'].
//
// Flashcard 7:
//   Front: ?user[$ne]=x under the extended parser?
//   Back : { user: { $ne: 'x' } } — operator injection if unvalidated.
//
// Flashcard 8:
//   Front: Can %2F match inside :id?
//   Back : Yes — matched raw, decoded after, so the value contains '/'.
//          Traversal risk; and proxies may normalise it away.
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "You aren't guaranteed a string — the caller picks the type, and
//          bracket syntax turns a param into a query operator."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write a coerce middleware that turns req.query.page/limit into bounded
//   integers with defaults, and assert on ?page=abc, ?page=-5, ?page=1e9.
//
// Task 2:
//   Reproduce the '21' bug in a real pagination link builder, then fix it
//   and write the assertion that would have caught it.
//
// Task 3:
//   Write a middleware that rejects any query value that is not a string,
//   and run §7's attack against it. Then decide where it should NOT be
//   applied (hint: endpoints that legitimately take ?ids[]=).
//
// Task 4:
//   Compare parsing of ?a[b][c]=1 under your extended parser and the real
//   qs library. How deep does qs nest by default, and why does it have a
//   depth limit at all?
//
// Task 5:
//   Add a route '/search' that reads five query params and returns a
//   normalised object. Then write the same thing with a schema validator
//   and compare the amount of code.
//
// Task 6:
//   Take §8's traversal value and join it onto a directory with path.join,
//   then with path.resolve plus a startsWith check. Prove the first escapes
//   the directory and the second does not. Then implement the portable
//   alternative: base64url-encode the id and decode it in a param hook
//   (05 §8).
//
// Task 7:
//   Build a canonical-URL middleware: sort query keys, drop empty values,
//   301 to the canonical form. Measure how many distinct URLs collapse into
//   one cache key.
//
// Task 8:
//   Instrument the matcher to log the compiled regex for five route
//   patterns, including one with an optional param and one wildcard. Reading
//   those regexes out loud is the fastest way to internalise this file.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Route params are capture groups in the route's regex and decide whether
//   the route matches at all; query params are parsed separately and are
//   invisible to matching.
//
// If you remember the common bug:
//   Everything is a string — `'2' + 1` is '21' — and under Express 4's
//   default parser a query value can arrive as an array or an object of the
//   caller's choosing.
//
// If you remember the professional framing:
//   Identity in the path, modifiers in the query, coercion and shape
//   validation once at the edge, and never a raw query value inside a
//   database query document.
//
// ─────────────────────────────────────────────────────────────────
// Six files in, every piece of the request side has been examined: the
// stack, next(), errors, routers, and now the values a request carries. What
// has never been laid out end to end is the ORDER — from the TCP socket to
// the last byte written — and where each of these pieces sits in it.
//
// NEXT TOPIC -> 07_request-lifecycle.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
