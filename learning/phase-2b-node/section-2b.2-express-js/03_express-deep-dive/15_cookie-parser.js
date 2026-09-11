// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  15_cookie-parser.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Cookie-parser
//
// WHAT YOU WILL MASTER HERE:
//   1. The asymmetry nobody states plainly: Set-Cookie carries attributes,
//      the Cookie header carries NONE of them — proven by sending five
//      attributes and getting back name=value
//   2. cookie-parser written out: one header, split, decode, req.cookies
//   3. Signed cookies as TAMPER DETECTION, not encryption — the value is
//      still fully readable, and a modified one is rejected
//   4. HttpOnly demonstrated against a document.cookie simulator
//   5. SameSite executed: the cross-site form POST that CORS could not stop
//      (10 §4) being stopped here, per value — Strict, Lax and None compared
//   6. The 4 KB budget, and what happens to a request when you exceed it
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/15_cookie-parser.js"
//
// Prerequisites: 10_cors-setup.js §4 (a cross-origin POST is delivered and
// handled — CORS only blocks the read, which is why CSRF exists) and
// 13_body-parsing-json-urlencoded.js (a parser that turns a header or body
// into an object on req). This file is the cookie half of the identity
// story; 16 is the session half.


const http = require("http");
const crypto = require("crypto");

const results = {};

const SECRET = "s3cr3t-signing-key";


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// cookie-parser:
// a middleware that reads the single Cookie request header, splits it into
// name/value pairs, URL-decodes them, and attaches the result as
// req.cookies — plus, when given a secret, verifies signed values and puts
// the verified ones on req.signedCookies.
//
// If interviewer says "explain it simply", say:
//   "The browser sends every applicable cookie as one header — a
//    semicolon-separated string. cookie-parser turns that string into an
//    object. That's genuinely all it does on the way in. On the way out you
//    don't need it at all: res.cookie() builds the Set-Cookie header, and
//    that's where all the security attributes live."
//
// If interviewer says "what's the catch?", say:
//   "The direction is asymmetric and it surprises people. Set-Cookie carries
//    HttpOnly, Secure, SameSite, Path, Domain and expiry — the browser
//    stores them and uses them to decide whether to send the cookie. But the
//    Cookie header the browser sends back contains only name=value. So the
//    server can never read a cookie's own attributes, cannot tell whether
//    the cookie it just received was HttpOnly, and cannot 'check' SameSite.
//    Those are enforced by the browser, and their absence is invisible to
//    you."
//
// Why it matters in interviews:
//   Cookies are the third security mechanism in this group that your server
//   only declares and the browser enforces — after CORS (10) and Helmet
//   (11). Recognising that pattern is the senior signal, and SameSite is
//   where it finally does stop CSRF.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ATTRIBUTES GO OUT, ONLY name=value COMES BACK.
//
// Runtime rule:
//   Response: one Set-Cookie header PER cookie, each carrying its
//   attributes. Request: ONE Cookie header for all of them, values only.
//   cookie-parser splits that one header; res.cookie() writes the others.
//
// Practical rule:
//   HttpOnly and Secure on anything session-related, SameSite=Lax as the
//   default and Strict where the UX allows, a signing secret for anything
//   you will trust on the way back, and never more than an identifier in the
//   value itself.
//
// Common trap:
//   Treating a signed cookie as a secret. Signing proves the value was not
//   modified; it does not hide it. A signed cookie carrying
//   `role=admin` is still readable by the user, and still a design mistake.
//
// The mental picture:
//
//   RESPONSE (per cookie)
//   Set-Cookie: sid=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
//               └───┬───┘  └──────────────── attributes ────────────────┘
//                   │              stored by the browser, never returned
//   REQUEST (all cookies, one header)
//   Cookie: sid=abc123; theme=dark
//           └────────── that is everything the server ever sees ──────────┘


// ══════════════════════════════════════════════════════════════════
// § 3 — WRITING cookie-parser AND res.cookie()
// ══════════════════════════════════════════════════════════════════

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    let value = pair.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (name in out) continue;                 // first occurrence wins (§4)
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
}

// s:<value>.<base64 hmac> — the format connect's cookie signing uses.
function sign(value, secret) {
  const mac = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  return "s:" + value + "." + mac;
}

function unsign(signed, secret) {
  if (!signed.startsWith("s:")) return false;
  const body = signed.slice(2);
  const idx = body.lastIndexOf(".");
  if (idx === -1) return false;
  const value = body.slice(0, idx);
  const mac = body.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b) ? value : false;    // constant-time (13 §7)
}

function cookieParser(secret) {
  return function cookieParserMiddleware(req, res, next) {
    const raw = parseCookieHeader(req.headers.cookie);
    req.cookies = {};
    req.signedCookies = {};
    for (const [name, value] of Object.entries(raw)) {
      if (secret && value.startsWith("s:")) {
        const unsigned = unsign(value, secret);
        // A failed unsign yields false — the value is NOT silently trusted.
        req.signedCookies[name] = unsigned;
      } else {
        req.cookies[name] = value;
      }
    }
    next();
  };
}

function serializeCookie(name, value, opts = {}) {
  let out = name + "=" + encodeURIComponent(value);
  if (opts.maxAge !== undefined) out += "; Max-Age=" + Math.floor(opts.maxAge / 1000);
  if (opts.path) out += "; Path=" + opts.path;
  if (opts.domain) out += "; Domain=" + opts.domain;
  if (opts.httpOnly) out += "; HttpOnly";
  if (opts.secure) out += "; Secure";
  if (opts.sameSite) out += "; SameSite=" + opts.sameSite;
  return out;
}

function decorate(res, secret) {
  res.cookie = (name, value, opts = {}) => {
    const v = opts.signed ? sign(String(value), secret) : String(value);
    const existing = res.getHeader("set-cookie") || [];
    // One Set-Cookie header PER cookie — never comma-joined (§4).
    res.setHeader("set-cookie", [...(Array.isArray(existing) ? existing : [existing]),
                                 serializeCookie(name, v, opts)]);
    return res;
  };
  res.clearCookie = (name, opts = {}) =>
    res.cookie(name, "", { ...opts, maxAge: 0 });
  return res;
}

// ── the browser: storage plus the rules that decide what gets sent ──
function makeBrowser() {
  const jar = [];                              // { name, value, attrs }
  return {
    receive(setCookieHeaders) {
      for (const header of [].concat(setCookieHeaders || [])) {
        const [pair, ...rest] = header.split(";").map((s) => s.trim());
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        const attrs = {};
        for (const a of rest) {
          const i = a.indexOf("=");
          if (i === -1) attrs[a.toLowerCase()] = true;
          else attrs[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
        }
        const existing = jar.findIndex((c) => c.name === name);
        if (existing !== -1) jar.splice(existing, 1);
        if (attrs["max-age"] === "0") continue;             // a deletion
        jar.push({ name, value, attrs });
      }
    },
    // The rules the browser applies before attaching anything (§7).
    cookieHeaderFor({ sameSiteContext = "same-site", method = "GET", topLevel = true, secureConnection = true } = {}) {
      const sendable = jar.filter((c) => {
        if (c.attrs.secure && !secureConnection) return false;
        const ss = String(c.attrs.samesite || "Lax").toLowerCase();
        if (sameSiteContext === "same-site") return true;
        if (ss === "strict") return false;
        if (ss === "lax") return method === "GET" && topLevel;
        if (ss === "none") return Boolean(c.attrs.secure);   // None REQUIRES Secure
        return false;
      });
      return sendable.map((c) => c.name + "=" + c.value).join("; ");
    },
    // What page JavaScript can see.
    documentCookie() {
      return jar.filter((c) => !c.attrs.httponly).map((c) => c.name + "=" + c.value).join("; ");
    },
    raw: () => jar.map((c) => ({ name: c.name, value: c.value, attrs: { ...c.attrs } })),
  };
}

function miniExpress(secret) {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    get(path, fn) { stack.push({ path, fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          decorate(res, secret);
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next() {
            const layer = stack[i++];
            if (!layer) { res.statusCode = 404; return res.end("not found"); }
            if (layer.path && layer.path !== urlPath) return next();
            layer.fn(req, res, next);
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — ONE HEADER OUT PER COOKIE, ONE HEADER BACK FOR ALL
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — the asymmetry ══\n");

  const app = miniExpress(SECRET);
  app.use(cookieParser(SECRET));
  app.get("/login", (req, res) => {
    res.cookie("sid", "abc123", {
      httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 3600_000,
    });
    res.cookie("theme", "dark", { path: "/" });
    res.cookie("locale", "en GB", { path: "/" });       // note the space
    res.end("logged in");
  });
  app.get("/whoami", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      cookies: req.cookies,
      rawHeader: req.headers.cookie ?? null,
    }));
  });

  const { server, port } = await app.listen();

  const browser = makeBrowser();
  const login = await request(port, "/login");
  browser.receive(login.headers["set-cookie"]);

  const cookieHeader = browser.cookieHeaderFor();
  const who = JSON.parse((await request(port, "/whoami", { cookie: cookieHeader })).body);
  server.close();

  results.setCookieHeaders = login.headers["set-cookie"];
  results.jar = browser.raw();
  results.cookieHeaderSentBack = who.rawHeader;
  results.parsedCookies = who.cookies;

  console.log("  Set-Cookie headers on the response (" + results.setCookieHeaders.length + " of them):");
  for (const h of results.setCookieHeaders) console.log("    " + h);
  console.log("\n  what the browser stored for 'sid':", JSON.stringify(results.jar[0].attrs));
  console.log("\n  Cookie header on the NEXT request:");
  console.log("    " + results.cookieHeaderSentBack);
  console.log("\n  req.cookies after parsing:", JSON.stringify(results.parsedCookies));
  console.log("\n  Look at what disappeared. The server sent HttpOnly, Secure,");
  console.log("  SameSite, Path and Max-Age. The browser stored all of them and used");
  console.log("  them to decide whether to send the cookie at all — and then sent back");
  console.log("  name=value and nothing else.");
  console.log("\n  Three consequences that follow immediately:");
  console.log("   • You cannot check server-side whether a cookie you received was");
  console.log("     HttpOnly or SameSite. If someone removed those attributes last");
  console.log("     month, nothing in your request handling will ever notice.");
  console.log("   • You cannot 'refresh' a cookie's expiry by reading it — you have to");
  console.log("     re-send the whole Set-Cookie with new attributes.");
  console.log("   • Values are URL-encoded on the way out and decoded on the way in,");
  console.log("     which is why 'en GB' survived the trip (" +
              JSON.stringify(results.parsedCookies.locale) + ").");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — SIGNED COOKIES: TAMPER DETECTION, NOT SECRECY
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — what a signature does and does not do ══\n");

  const app = miniExpress(SECRET);
  app.use(cookieParser(SECRET));
  app.get("/set", (req, res) => {
    res.cookie("user", "alice", { signed: true });
    res.cookie("plain", "alice", {});
    res.end("set");
  });
  app.get("/read", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ cookies: req.cookies, signedCookies: req.signedCookies }));
  });

  const { server, port } = await app.listen();

  const set = await request(port, "/set");
  const cookies = set.headers["set-cookie"];
  const signedValue = decodeURIComponent(/user=([^;]+)/.exec(cookies.join(";"))[1]);

  // honest round trip
  const honest = JSON.parse((await request(port, "/read",
    { cookie: "user=" + encodeURIComponent(signedValue) })).body);

  // the user edits the value but keeps the signature
  const tamperedValue = signedValue.replace("s:alice.", "s:admin.");
  const tampered = JSON.parse((await request(port, "/read",
    { cookie: "user=" + encodeURIComponent(tamperedValue) })).body);

  // the user edits a PLAIN cookie — nothing detects it
  const plainTampered = JSON.parse((await request(port, "/read", { cookie: "plain=admin" })).body);

  server.close();

  results.signedRaw = signedValue;
  results.valueIsReadable = signedValue.includes("alice");
  results.honestSigned = honest.signedCookies.user;
  results.tamperedSigned = tampered.signedCookies.user;
  results.plainTampered = plainTampered.cookies.plain;

  console.log("  the cookie the browser stores:");
  console.log("    " + signedValue);
  console.log("\n  is the value readable by the user?", results.valueIsReadable,
              " ← 'alice' is right there in plain text");
  console.log("  honest round trip  → req.signedCookies.user =", JSON.stringify(results.honestSigned), " ✅");
  console.log("  value edited to 'admin', signature kept:");
  console.log("                     → req.signedCookies.user =", JSON.stringify(results.tamperedSigned),
              " ← false, rejected ✅");
  console.log("  an UNSIGNED cookie edited to 'admin':");
  console.log("                     → req.cookies.plain =", JSON.stringify(results.plainTampered),
              " 🐛 accepted, indistinguishable from real");
  console.log("\n  That is the whole feature, and both halves matter:");
  console.log("   • Signing detects modification. A tampered value comes back as false,");
  console.log("     so `if (req.signedCookies.user)` fails closed.");
  console.log("   • Signing does NOT hide anything. The user can read the value, and");
  console.log("     they can read it on a shared machine, and it lands in any log that");
  console.log("     captures headers.");
  console.log("\n  So a signed cookie is the right place for an opaque identifier and the");
  console.log("  wrong place for role=admin, an email, or a plan tier — not because it");
  console.log("  can be forged, but because it is public, and because the value is now");
  console.log("  a copy of state that can no longer be revoked. That is precisely the");
  console.log("  argument for a session store → 16_session-management.js.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — HttpOnly VERSUS document.cookie
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — what injected JavaScript can steal ══\n");

  const app = miniExpress(SECRET);
  app.use(cookieParser(SECRET));
  app.get("/login", (req, res) => {
    res.cookie("sid", "session-token-abc", { httpOnly: true, sameSite: "Lax", path: "/" });
    res.cookie("theme", "dark", { path: "/" });
    res.cookie("analytics_id", "u-99", { path: "/" });
    res.end("ok");
  });
  app.get("/me", (req, res) => res.end(JSON.stringify(req.cookies)));

  const { server, port } = await app.listen();

  const browser = makeBrowser();
  browser.receive((await request(port, "/login")).headers["set-cookie"]);

  const visibleToScript = browser.documentCookie();
  const sentToServer = browser.cookieHeaderFor();
  const serverSees = JSON.parse((await request(port, "/me", { cookie: sentToServer })).body);

  server.close();

  results.documentCookie = visibleToScript;
  results.serverSeesCookies = serverSees;
  results.sidHiddenFromScript = !visibleToScript.includes("session-token-abc");
  results.sidVisibleToServer = serverSees.sid === "session-token-abc";

  console.log("  document.cookie (what an injected script reads):");
  console.log("    " + JSON.stringify(visibleToScript));
  console.log("  Cookie header (what the server receives):");
  console.log("    " + JSON.stringify(sentToServer));
  console.log("\n  session cookie hidden from JavaScript:", results.sidHiddenFromScript, " ✅");
  console.log("  session cookie still sent to the server:", results.sidVisibleToServer, " ✅");
  console.log("\n  This is the single highest-value cookie attribute. 11 §9 proved that");
  console.log("  Helmet does not stop an XSS payload from being stored and reflected —");
  console.log("  HttpOnly is what stops the payload from being ABLE to exfiltrate the");
  console.log("  session, because document.cookie simply does not contain it.");
  console.log("\n  The honest limit: an XSS that cannot read the cookie can still USE it.");
  console.log("  The script runs on your origin, so any fetch() it makes carries the");
  console.log("  cookie automatically. HttpOnly downgrades 'steal the session and use it");
  console.log("  forever from anywhere' to 'act as the user while this page is open'.");
  console.log("  That is a large downgrade and it is not a cure.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — SameSite: THE ATTRIBUTE THAT ACTUALLY STOPS CSRF
// ══════════════════════════════════════════════════════════════════
//
// 10 §4 proved a cross-origin POST is delivered and handled — CORS only
// blocks the READ. So the attack works precisely because the browser
// attaches your cookies. SameSite is where that stops.

function section7() {
  console.log("\n══ § 7 — will the browser attach the cookie? ══\n");

  const scenarios = [
    { label: "same-site XHR (your own app)", ctx: { sameSiteContext: "same-site", method: "POST", topLevel: false } },
    { label: "cross-site link click (GET)",  ctx: { sameSiteContext: "cross-site", method: "GET", topLevel: true } },
    { label: "cross-site <img> / subresource", ctx: { sameSiteContext: "cross-site", method: "GET", topLevel: false } },
    { label: "CROSS-SITE FORM POST (CSRF)",  ctx: { sameSiteContext: "cross-site", method: "POST", topLevel: true } },
    { label: "cross-site fetch POST",        ctx: { sameSiteContext: "cross-site", method: "POST", topLevel: false } },
  ];

  const variants = {
    "SameSite=Strict": { sameSite: "Strict", secure: true },
    "SameSite=Lax (default)": { sameSite: "Lax", secure: true },
    "SameSite=None; Secure": { sameSite: "None", secure: true },
    "SameSite=None, no Secure": { sameSite: "None" },
  };

  const table = {};
  for (const [label, opts] of Object.entries(variants)) {
    const browser = makeBrowser();
    browser.receive([serializeCookie("sid", "abc", { ...opts, path: "/" })]);
    table[label] = {};
    for (const s of scenarios) {
      table[label][s.label] = browser.cookieHeaderFor({ ...s.ctx, secureConnection: true }).includes("sid");
    }
  }
  results.sameSiteTable = table;

  const cols = scenarios.map((s) => s.label);
  console.log("  cookie setting              " + cols.map((c) => c.slice(0, 16).padEnd(18)).join(""));
  console.log("  " + "─".repeat(28 + 18 * cols.length));
  for (const [label, row] of Object.entries(table)) {
    console.log("  " + label.padEnd(28) + cols.map((c) => (row[c] ? "sent" : "not sent").padEnd(18)).join(""));
  }

  console.log("\n  The column that matters is the CSRF one — a form on evil.example");
  console.log("  POSTing to your app. 10 §5 proved that request is a SIMPLE request, so");
  console.log("  it is not preflighted, and 10 §4 proved it reaches your handler and");
  console.log("  commits its side effect. The only question is whether the user's");
  console.log("  session cookie rides along, and that is decided entirely by SameSite.");
  console.log("\n   • Strict — never sent cross-site. Safest, and it also breaks the");
  console.log("     'click a link in an email and arrive logged in' flow, which is why");
  console.log("     it is not the default.");
  console.log("   • Lax — the modern browser default. Sent on top-level GET navigation");
  console.log("     only, so links work and cross-site POSTs do not carry the session.");
  console.log("     This is the setting that neutralises classic form CSRF.");
  console.log("   • None — sent everywhere, required for genuine third-party embedding,");
  console.log("     and only honoured together with Secure. The last row shows the");
  console.log("     failure: SameSite=None without Secure is REJECTED, so the cookie");
  console.log("     effectively stops working — a real outage when someone adds None to");
  console.log("     'fix' an embed and forgets Secure.");
  console.log("\n  Caveat worth stating: Lax is a browser DEFAULT, not a guarantee. Old");
  console.log("  browsers, and any client that is not a browser, do not apply it. For");
  console.log("  state-changing endpoints, SameSite is defence in depth alongside a CSRF");
  console.log("  token (→ 16), not a replacement for one.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE 4 KB BUDGET
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — cookies are a very small database ══\n");

  const LIMIT = 4096;
  const app = miniExpress(SECRET);
  app.use(cookieParser(SECRET));
  app.get("/set", (req, res) => {
    const size = Number(new URL("http://x" + req.url).searchParams.get("size") || 100);
    res.cookie("blob", "x".repeat(size), { path: "/" });
    const header = [].concat(res.getHeader("set-cookie")).join("");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ headerBytes: Buffer.byteLength(header), overBudget: Buffer.byteLength(header) > LIMIT }));
  });
  app.get("/echo", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ received: Buffer.byteLength(req.headers.cookie || ""), names: Object.keys(req.cookies) }));
  });

  const { server, port } = await app.listen();

  const small = JSON.parse((await request(port, "/set?size=100")).body);
  const big = JSON.parse((await request(port, "/set?size=5000")).body);

  // Ten cookies on every request to a site with 40 assets:
  const many = Array.from({ length: 10 }, (_, i) => "c" + i + "=" + "v".repeat(200)).join("; ");
  const echoed = JSON.parse((await request(port, "/echo", { cookie: many })).body);
  server.close();

  results.cookieBudget = {
    small: small.headerBytes,
    big: big.headerBytes,
    bigOverBudget: big.overBudget,
    perRequestBytes: echoed.received,
    cookieCount: echoed.names.length,
    costPerPageLoad: echoed.received * 40,
  };

  console.log("  a 100-byte value  → Set-Cookie header is", small.headerBytes, "bytes");
  console.log("  a 5000-byte value → Set-Cookie header is", big.headerBytes, "bytes  overBudget:",
              big.overBudget, " 🐛");
  console.log("\n  ten 200-byte cookies on one request:");
  console.log("    Cookie header size:", results.cookieBudget.perRequestBytes, "bytes");
  console.log("    on a page with 40 same-origin assets:",
              (results.cookieBudget.costPerPageLoad / 1024).toFixed(1), "KB uploaded, per page load");
  console.log("\n  Two separate limits, both about 4 KB:");
  console.log("   • Per cookie: a browser silently DROPS an oversized cookie. No error");
  console.log("     is reported to your code — the Set-Cookie simply has no effect, and");
  console.log("     the symptom is 'users get logged out at random'.");
  console.log("   • Per request: every cookie for that domain is attached to every");
  console.log("     request, including images, CSS and API calls. A few kilobytes of");
  console.log("     cookies is a few kilobytes on every single request, uploaded over");
  console.log("     the slower half of the connection.");
  console.log("\n  Hence the rule this file has been building toward: put an opaque");
  console.log("  identifier in the cookie and keep the data server-side. That is what a");
  console.log("  session is, and it is the next file.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Trying to read a cookie's attributes server-side. Only name=value
//   comes back; the attributes are invisible. → §4
//
// Bug 2 — Treating a signed cookie as encrypted, and putting a role, an
//   email or a plan tier in it. Readable by the user, and unrevocable. → §5
//
// Bug 3 — Trusting req.cookies for anything security-relevant instead of
//   req.signedCookies — an unsigned cookie can simply be edited. → §5
//
// Bug 4 — Session cookie without HttpOnly, so any XSS exfiltrates it and
//   the session outlives the page. → §6
//
// Bug 5 — SameSite=None added to fix an embed, without Secure, so the
//   cookie stops working entirely. → §7
//
// Bug 6 — Assuming SameSite=Lax removes the need for CSRF tokens on
//   state-changing endpoints. It is a default, not a guarantee. → §7
//
// Bug 7 — SameSite=Strict on the main session cookie, then a support ticket
//   saying "the link in the email logs me out". → §7
//
// Bug 8 — Storing a JSON blob in a cookie, exceeding ~4 KB, and the browser
//   silently dropping it: "random logouts". → §8
//
// Bug 9 — Cookies on a domain that also serves static assets, adding
//   kilobytes to every image request. Serve assets from a cookieless
//   domain. → §8
//
// Bug 10 — clearCookie() that does not match the original Path and Domain,
//   so the cookie is not actually deleted and the user stays "logged in".
//
// Bug 11 — Comparing a signature with === instead of timingSafeEqual. → §3
//
// Bug 12 — cookie-parser registered below the route that reads req.cookies,
//   so it is undefined. The same ordering bug as everything else. → 01 §4


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — asymmetry:
  assert.equal(results.setCookieHeaders.length, 3, "three cookies produced THREE Set-Cookie headers ✅");
  assert.ok(results.setCookieHeaders[0].includes("HttpOnly"), "…the first carrying HttpOnly…");
  assert.ok(results.setCookieHeaders[0].includes("SameSite=Lax"), "…and SameSite…");
  assert.ok(results.setCookieHeaders[0].includes("Max-Age=3600"), "…and Max-Age");
  assert.equal(results.cookieHeaderSentBack, "sid=abc123; theme=dark; locale=en%20GB",
    "…while the request carried ONE Cookie header with values only — every attribute gone 🐛");
  assert.ok(!results.cookieHeaderSentBack.includes("HttpOnly"),
    "…the server cannot see HttpOnly on the way back ✅ (it is browser state)");
  assert.deepEqual(results.parsedCookies, { sid: "abc123", theme: "dark", locale: "en GB" },
    "…and cookie-parser decoded the values, so 'en GB' survived the round trip ✅");
  assert.equal(results.jar[0].attrs.httponly, true, "…the browser did store the attributes, for its own use");

  // § 5 — signing:
  assert.equal(results.valueIsReadable, true,
    "the signed cookie's value is plainly readable — signing is not encryption 🐛");
  assert.ok(results.signedRaw.startsWith("s:alice."), "…in the s:<value>.<hmac> format");
  assert.equal(results.honestSigned, "alice", "an untouched signed cookie verified ✅");
  assert.equal(results.tamperedSigned, false,
    "…and a value edited to 'admin' came back as false, not as 'admin' ✅");
  assert.equal(results.plainTampered, "admin",
    "…while the same edit to an UNSIGNED cookie was accepted verbatim 🐛");

  // § 6 — HttpOnly:
  assert.equal(results.sidHiddenFromScript, true,
    "the HttpOnly session cookie was invisible to document.cookie ✅");
  assert.ok(results.documentCookie.includes("theme=dark"),
    "…while non-HttpOnly cookies remained readable by scripts");
  assert.ok(results.documentCookie.includes("analytics_id"));
  assert.equal(results.sidVisibleToServer, true,
    "…and the server still received it normally ✅");

  // § 7 — SameSite:
  const t = results.sameSiteTable;
  assert.equal(t["SameSite=Lax (default)"]["same-site XHR (your own app)"], true,
    "Lax sends the cookie for your own app's requests ✅");
  assert.equal(t["SameSite=Lax (default)"]["cross-site link click (GET)"], true,
    "…and for a top-level navigation, so email links still work ✅");
  assert.equal(t["SameSite=Lax (default)"]["CROSS-SITE FORM POST (CSRF)"], false,
    "…but NOT for a cross-site form POST — this is the CSRF fix ✅");
  assert.equal(t["SameSite=Strict"]["cross-site link click (GET)"], false,
    "Strict blocks even a link click, which is the UX cost ✅");
  assert.equal(t["SameSite=Strict"]["same-site XHR (your own app)"], true,
    "…while leaving your own app unaffected");
  assert.equal(t["SameSite=None; Secure"]["CROSS-SITE FORM POST (CSRF)"], true,
    "None sends the cookie everywhere — the CSRF exposure is back 🐛");
  assert.equal(t["SameSite=None, no Secure"]["same-site XHR (your own app)"], true);
  assert.equal(t["SameSite=None, no Secure"]["cross-site fetch POST"], false,
    "…and SameSite=None WITHOUT Secure is rejected cross-site, so the cookie stops working 🐛");

  // § 8 — size:
  assert.ok(results.cookieBudget.big > 4096,
    "a 5 KB value produced a Set-Cookie header over the ~4 KB browser limit 🐛");
  assert.equal(results.cookieBudget.bigOverBudget, true, "…which a browser silently drops, with no error");
  assert.ok(results.cookieBudget.small < 200, "…while a small cookie is a couple of hundred bytes");
  assert.equal(results.cookieBudget.cookieCount, 10, "ten cookies parsed from one header");
  assert.ok(results.cookieBudget.costPerPageLoad > 80_000,
    "…costing over 80 KB of upload across a 40-asset page load 🐛 (" +
    Math.round(results.cookieBudget.costPerPageLoad / 1024) + " KB)");

  console.log("§10 — mini assertions passed for: Cookie-parser");
  console.log("\n  The pair that captures it: five attributes went out on Set-Cookie and");
  console.log("  exactly zero came back — and SameSite=Lax refused to attach the session");
  console.log("  to the cross-site form POST that CORS (10 §4) was powerless to stop.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do cookies work in Express?", answer:
//
//   "On the way out, res.cookie() writes a Set-Cookie header — one per
//    cookie — carrying the value plus its attributes: HttpOnly, Secure,
//    SameSite, Path, Domain, expiry. On the way in, the browser sends a
//    single Cookie header containing every applicable cookie as name=value
//    pairs, and cookie-parser splits and decodes that into req.cookies.
//
//    The thing I'd lead with is that those directions are asymmetric. The
//    attributes go out and never come back. The browser stores them and uses
//    them to decide whether to send the cookie at all, so the server can
//    never check whether a cookie it received was HttpOnly or what its
//    SameSite was — if someone deleted those attributes, nothing in your
//    request handling notices. It's the same pattern as CORS and Helmet:
//    the server declares, the browser enforces.
//
//    Signed cookies are the one part people misread. Signing is an HMAC, so
//    it detects modification — a tampered value comes back as false rather
//    than as the tampered string. It does not encrypt anything: the value is
//    right there in plain text. So a signed cookie is the right place for an
//    opaque session id and the wrong place for role=admin, both because the
//    user can read it and because it's a copy of state you can no longer
//    revoke.
//
//    Of the attributes, HttpOnly and SameSite do the heavy lifting. HttpOnly
//    keeps the session out of document.cookie, so an XSS can't exfiltrate it
//    — though it can still act as the user while the page is open, since
//    fetches from your origin carry it automatically. And SameSite is where
//    CSRF actually gets fixed: a cross-site form POST is a simple request,
//    so CORS doesn't stop it and it reaches your handler — but with
//    SameSite=Lax the browser doesn't attach the session cookie, so the
//    request arrives unauthenticated. Lax is the modern default; Strict also
//    breaks 'click the link in your email and arrive logged in'; None
//    re-opens the exposure and is ignored unless you also set Secure, which
//    is a nice way to break your own login while trying to fix an embed.
//
//    And cookies are about 4 KB, per cookie and per request. Oversized ones
//    are silently dropped, which presents as random logouts, and everything
//    you store is uploaded on every request to that domain — which is the
//    argument for keeping an id in the cookie and the data in a session
//    store."
//
// "Attributes go out, only name=value comes back" is the sentence that makes
// this answer sound like someone who has actually debugged a cookie.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How many Set-Cookie headers for three cookies?
// A1. Three. But only ONE Cookie header comes back (§4).
//
// Q2. Can the server read a cookie's attributes?
// A2. No. Only name=value is returned (§4).
//
// Q3. What does cookie-parser actually do?
// A3. Splits and URL-decodes the Cookie header into req.cookies, and
//     verifies signed values into req.signedCookies (§3).
//
// Q4. Are signed cookies encrypted?
// A4. No — HMAC-signed. The value is readable; modification is detected
//     (§5).
//
// Q5. What does a tampered signed cookie produce?
// A5. false, so a truthiness check fails closed (§5).
//
// Q6. What does HttpOnly prevent?
// A6. document.cookie access, so an XSS can't exfiltrate the value (§6).
//
// Q7. Does HttpOnly stop an XSS using the session?
// A7. No — fetches from your origin still carry it. It stops the theft, not
//     the abuse (§6).
//
// Q8. Which SameSite value stops classic CSRF?
// A8. Lax (or Strict). Lax still allows top-level GET navigation (§7).
//
// Q9. Why does SameSite=None sometimes break everything?
// A9. It is only honoured with Secure; without it the cookie is rejected
//     cross-site (§7).
//
// Q10. Is SameSite enough on its own?
// A10. No — it is a browser default, not a guarantee, and non-browser
//      clients ignore it. Pair it with CSRF tokens on state-changing
//      endpoints (§7, → 16).
//
// Q11. What is the size limit?
// A11. ~4 KB per cookie and a similar practical cap per request. Oversized
//      cookies are dropped silently (§8).
//
// Q12. Why does clearCookie sometimes not clear?
// A12. Deletion must match Path and Domain exactly, or a different cookie
//      is deleted and the original survives (§9 Bug 10).
//
// Q13. Cookies vs localStorage for a token?
// A13. localStorage is readable by any script, so an XSS takes the token
//      permanently — there is no HttpOnly equivalent. A cookie with
//      HttpOnly + SameSite is the stronger default.
//
// Q14. What's the __Host- prefix?
// A14. A naming convention browsers enforce: the cookie must be Secure,
//      Path=/, and have no Domain — which prevents a subdomain from
//      overwriting it.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What comes back in the Cookie header?
//   Back : name=value only. Never attributes.
//
// Flashcard 2:
//   Front: Set-Cookie headers for N cookies?
//   Back : N of them, one each.
//
// Flashcard 3:
//   Front: Signed cookie = encrypted?
//   Back : No. HMAC — tamper detection, value fully readable.
//
// Flashcard 4:
//   Front: Tampered signed cookie yields?
//   Back : false.
//
// Flashcard 5:
//   Front: HttpOnly stops?
//   Back : document.cookie reading it. Not its use from your origin.
//
// Flashcard 6:
//   Front: SameSite=Lax on a cross-site form POST?
//   Back : Cookie not attached — CSRF neutralised.
//
// Flashcard 7:
//   Front: SameSite=None without Secure?
//   Back : Rejected. The cookie stops working cross-site.
//
// Flashcard 8:
//   Front: Cookie size limit?
//   Back : ~4 KB, silently dropped when exceeded.
//
// Flashcard 9:
//   Front: Cookie vs localStorage for tokens?
//   Back : Cookie — localStorage has no HttpOnly equivalent.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "Attributes go out and never come back — the server cannot check
//          what it never receives."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add __Host- prefix validation to res.cookie(): refuse to set such a
//   cookie unless Secure, Path=/ and no Domain. Prove the refusal.
//
// Task 2:
//   Implement cookie rotation: on each request, re-issue the session cookie
//   with a fresh Max-Age. Measure the extra bytes per response.
//
// Task 3:
//   Reproduce Bug 10: set a cookie with Path=/app, clear it with the default
//   path, and prove it survives.
//
// Task 4:
//   Build the CSRF demo end to end — an attacker page with a form POST — and
//   flip SameSite between None and Lax to watch the attack succeed and fail.
//
// Task 5:
//   Add encryption on top of signing (AES-GCM, 2B.1 · 02/09) and discuss
//   what it buys you and what it does not.
//
// Task 6:
//   Measure the real per-request cost: 8 cookies × 300 bytes across a
//   60-asset page, at both 1 Mbps and 10 Mbps upload.
//
// Task 7:
//   Write a middleware that warns in development whenever a Set-Cookie
//   lacks HttpOnly or SameSite. That is a lint rule you can actually ship.
//
// Task 8:
//   Implement the browser's cookie precedence rules: two cookies with the
//   same name but different Path. Which is sent first, and why does that
//   make same-name cookies dangerous?


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Attributes travel OUT on Set-Cookie and never come back. The browser
//   stores and enforces them; your server sees only name=value.
//
// If you remember the common bug:
//   Treating a signed cookie as a secret and putting real state in it —
//   readable by the user, and impossible to revoke.
//
// If you remember the professional framing:
//   HttpOnly + Secure + SameSite=Lax on an opaque, signed session id, kept
//   far under 4 KB, with the data itself server-side.
//
// ─────────────────────────────────────────────────────────────────
// The last three sections have all pointed at the same conclusion: put an
// identifier in the cookie and keep the state on the server. That is a
// session, and it brings its own set of problems — where the store lives,
// what happens on logout, and how to stop one cookie value from being valid
// forever.
//
// NEXT TOPIC -> 16_session-management.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  section7();
  await section8();
  assertions();
})();
