// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  11_helmet-js-security-headers.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Helmet.js security headers
//
// WHAT YOU WILL MASTER HERE:
//   1. What Helmet is and — more importantly — what it is not: fifteen
//      response headers, zero input validation, zero request filtering
//   2. Every default header printed from a real response, with the attack
//      each one answers named next to it
//   3. MIME sniffing executed: the same uploaded file treated as text with
//      nosniff and as HTML without it, through a sniffing-browser simulator
//   4. Clickjacking executed: the same page embeddable from evil.example
//      until X-Frame-Options / frame-ancestors is set
//   5. CSP evaluated against four policies and five resources, including
//      why 'unsafe-inline' hands the whole mechanism back
//   6. Nonce-based CSP working: the same inline script blocked and then
//      allowed by one attribute
//   7. The honest limits: HSTS does nothing on a first visit, and CSP does
//      not stop the XSS — it stops the payload from being useful
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/11_helmet-js-security-headers.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js §4 (position decides
// whether a middleware runs at all) and 10_cors-setup.js §4 (a security
// rule the BROWSER enforces while your server only declares). Helmet is the
// second, larger example of that same shape — which is why the browser
// simulators in this file exist.


const http = require("http");
const crypto = require("crypto");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Helmet:
// a collection of small middlewares that set (and one that removes) HTTP
// response headers whose only job is to tell the browser to switch on
// protections it does not enable by default — content sniffing, framing,
// script execution, referrer leakage, transport downgrade.
//
// If interviewer says "explain it simply", say:
//   "It's about fifteen one-line middlewares bundled together. Each one sets
//    a response header that changes how the browser treats the page.
//    Nothing about it inspects the request, sanitises input, or blocks
//    anybody — it's purely instructions to the client, and the client is the
//    thing enforcing them."
//
// If interviewer says "so is app.use(helmet()) enough?", say:
//   "It's a good default and it's free, but calling it security is a
//    mistake. It has nothing to say about SQL injection, authorisation,
//    rate limiting, secrets in your repo, or dependency vulnerabilities.
//    And the one header that matters most — Content-Security-Policy —
//    ships with a default that will break a real app the moment you have an
//    inline script or a CDN, so it's the one people disable first and then
//    forget."
//
// Why it matters in interviews:
//   It's the fastest way to find out whether someone understands the
//   difference between a defence and a declaration. The senior answer names
//   what each header actually prevents, and admits which ones do nothing on
//   a first visit.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   HELMET SETS HEADERS. THE BROWSER DOES THE WORK. NOTHING IS FILTERED.
//
// Runtime rule:
//   app.use(helmet()) registers a stack of middlewares that call
//   res.setHeader on every response passing through them — so, like every
//   other middleware, only for requests that reach it, and only if the
//   response has not started (07 §6).
//
// Practical rule:
//   helmet() first in the stack, above cors, above routes, above static.
//   Then spend your time on Content-Security-Policy specifically — the other
//   fourteen headers are correct out of the box; CSP is the one that needs a
//   real policy for your app.
//
// Common trap:
//   Turning CSP off (`contentSecurityPolicy: false`) to fix a broken page
//   and shipping it that way. The header that stops an XSS payload from
//   doing anything is now gone, and the fourteen remaining ones do not
//   substitute for it.
//
// The mental picture:
//
//   response headers                 what the browser stops doing
//   ────────────────                 ───────────────────────────
//   X-Content-Type-Options: nosniff  guessing that your .txt is HTML
//   X-Frame-Options / frame-ancestors  letting evil.example iframe you
//   Content-Security-Policy          running scripts you did not authorise
//   Strict-Transport-Security        speaking http:// to you again
//   Referrer-Policy                  leaking your URL to third parties
//   Cross-Origin-*-Policy            sharing your process / your bytes
//   (x-powered-by REMOVED)           announcing the framework


// ══════════════════════════════════════════════════════════════════
// § 3 — HELMET, AND A BROWSER THAT OBEYS IT
// ══════════════════════════════════════════════════════════════════

const HELMET_DEFAULTS = {
  "content-security-policy":
    "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';" +
    "frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';" +
    "script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=15552000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-dns-prefetch-control": "off",
  "x-download-options": "noopen",
  "x-frame-options": "SAMEORIGIN",
  "x-permitted-cross-domain-policies": "none",
  "x-xss-protection": "0",
};

function helmet(options = {}) {
  return function helmetMiddleware(req, res, next) {
    for (const [name, value] of Object.entries(HELMET_DEFAULTS)) {
      if (options[name] === false) continue;                       // explicitly disabled
      res.setHeader(name, options[name] ?? value);                 // or overridden
    }
    res.removeHeader("x-powered-by");                              // §4
    next();
  };
}

// ── browser simulators: the enforcement Helmet only asks for ──

// 1. MIME sniffing. Without nosniff a browser may ignore Content-Type and
//    decide from the bytes. With it, the declared type is final.
function browserInterpret(headers, body) {
  const declared = (headers["content-type"] || "").split(";")[0].trim();
  const nosniff = (headers["x-content-type-options"] || "").toLowerCase() === "nosniff";
  const looksLikeHtml = /^\s*<(!doctype|html|script|svg|b|h1)/i.test(body);
  const effective = !nosniff && looksLikeHtml ? "text/html" : declared;
  return { declared, effective, sniffed: effective !== declared, executesScript: effective === "text/html" };
}

// 2. Framing. X-Frame-Options is the legacy header; CSP frame-ancestors wins
//    when both are present.
function browserCanFrame(headers, embedderOrigin, pageOrigin) {
  const csp = parseCsp(headers["content-security-policy"] || "");
  if (csp["frame-ancestors"]) {
    const list = csp["frame-ancestors"];
    if (list.includes("'none'")) return { allowed: false, by: "CSP frame-ancestors 'none'" };
    if (list.includes("'self'") && embedderOrigin === pageOrigin) return { allowed: true, by: "CSP 'self'" };
    if (list.includes(embedderOrigin)) return { allowed: true, by: "CSP allow-list" };
    return { allowed: false, by: "CSP frame-ancestors" };
  }
  const xfo = (headers["x-frame-options"] || "").toUpperCase();
  if (xfo === "DENY") return { allowed: false, by: "X-Frame-Options: DENY" };
  if (xfo === "SAMEORIGIN") {
    return embedderOrigin === pageOrigin
      ? { allowed: true, by: "X-Frame-Options: SAMEORIGIN (same site)" }
      : { allowed: false, by: "X-Frame-Options: SAMEORIGIN" };
  }
  return { allowed: true, by: "no framing header at all" };
}

function parseCsp(policy) {
  const out = {};
  for (const directive of policy.split(";")) {
    const [name, ...values] = directive.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = values;
  }
  return out;
}

// 3. CSP evaluation for a script resource.
function cspAllowsScript(policy, resource, pageOrigin) {
  const csp = parseCsp(policy);
  const list = csp["script-src"] || csp["default-src"];
  if (!list) return { allowed: true, by: "no script-src and no default-src" };

  if (resource.kind === "inline") {
    if (resource.nonce && list.includes("'nonce-" + resource.nonce + "'")) {
      return { allowed: true, by: "matching nonce" };
    }
    if (list.includes("'unsafe-inline'")) return { allowed: true, by: "'unsafe-inline'" };
    return { allowed: false, by: "inline script with no nonce and no 'unsafe-inline'" };
  }
  if (list.includes("'self'") && resource.origin === pageOrigin) return { allowed: true, by: "'self'" };
  if (list.includes(resource.origin)) return { allowed: true, by: "explicit allow-list entry" };
  if (list.includes("'none'")) return { allowed: false, by: "'none'" };
  return { allowed: false, by: "origin not in script-src" };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    get(path, fn) { stack.push({ path, fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          res.setHeader("x-powered-by", "Express");        // Express does this by default (§4)
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

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const SITE = "https://app.example";
const EVIL = "https://evil.example";


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT ONE LINE ADDS, AND WHAT IT REMOVES
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — the response, before and after helmet() ══\n");

  const bare = miniExpress();
  bare.get("/", (req, res) => { res.setHeader("content-type", "text/html"); res.end("<h1>hi</h1>"); });

  const armoured = miniExpress();
  armoured.use(helmet());
  armoured.get("/", (req, res) => { res.setHeader("content-type", "text/html"); res.end("<h1>hi</h1>"); });

  const b = await bare.listen();
  const a = await armoured.listen();
  const bareRes = await request(b.port, "/");
  const helmetRes = await request(a.port, "/");
  b.server.close();
  a.server.close();

  const interesting = (h) => Object.fromEntries(
    Object.entries(h).filter(([k]) => !["date", "connection", "transfer-encoding", "content-length", "keep-alive"].includes(k))
  );

  results.bareHeaders = interesting(bareRes.headers);
  results.helmetHeaders = interesting(helmetRes.headers);
  results.poweredByBare = bareRes.headers["x-powered-by"];
  results.poweredByHelmet = helmetRes.headers["x-powered-by"];
  results.headerCountAdded =
    Object.keys(results.helmetHeaders).length - Object.keys(results.bareHeaders).length;

  console.log("  WITHOUT helmet:");
  for (const [k, v] of Object.entries(results.bareHeaders)) console.log("    " + k + ": " + v);
  console.log("\n  WITH helmet():");
  for (const [k, v] of Object.entries(results.helmetHeaders)) {
    console.log("    " + k + ": " + (String(v).length > 66 ? String(v).slice(0, 63) + "…" : v));
  }
  console.log("\n  x-powered-by  before:", JSON.stringify(results.poweredByBare),
              "  after:", JSON.stringify(results.poweredByHelmet));
  console.log("\n  Header-by-header, what each one is answering:");
  console.log("    x-content-type-options   MIME sniffing        → §5");
  console.log("    x-frame-options          clickjacking         → §6");
  console.log("    content-security-policy  XSS payload execution→ §7, §8");
  console.log("    strict-transport-security downgrade to http   → §9");
  console.log("    referrer-policy          URL leakage to third parties");
  console.log("    cross-origin-*-policy    Spectre-class side channels, hotlinking");
  console.log("    x-dns-prefetch-control   passive DNS leakage of linked hosts");
  console.log("    x-permitted-cross-domain-policies  legacy Flash/PDF crossdomain.xml");
  console.log("    x-xss-protection: 0      DISABLES the old browser XSS auditor,");
  console.log("                             which was itself exploitable — this is one");
  console.log("                             header Helmet sets to turn something OFF.");
  console.log("\n  And x-powered-by is a REMOVAL. It doesn't stop an attack; it stops");
  console.log("  handing a scanner the framework name for free.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — MIME SNIFFING, EXECUTED
// ══════════════════════════════════════════════════════════════════
//
// The scenario: a user uploads "notes.txt", you serve it back as text/plain
// (which is correct), and the file contains HTML.

async function section5() {
  console.log("\n══ § 5 — nosniff: the upload that becomes a page ══\n");

  const uploaded = "<script>alert(document.cookie)</script>";

  const sniffable = miniExpress();
  sniffable.get("/notes.txt", (req, res) => {
    res.setHeader("content-type", "text/plain");
    res.end(uploaded);
  });

  const protectedApp = miniExpress();
  protectedApp.use(helmet());
  protectedApp.get("/notes.txt", (req, res) => {
    res.setHeader("content-type", "text/plain");
    res.end(uploaded);
  });

  const s = await sniffable.listen();
  const p = await protectedApp.listen();
  const sRes = await request(s.port, "/notes.txt");
  const pRes = await request(p.port, "/notes.txt");
  s.server.close();
  p.server.close();

  results.sniffWithout = browserInterpret(sRes.headers, sRes.body);
  results.sniffWith = browserInterpret(pRes.headers, pRes.body);

  console.log("  the server declared text/plain in BOTH cases. The browser decided:");
  console.log("    without nosniff →", JSON.stringify(results.sniffWithout));
  console.log("    with nosniff    →", JSON.stringify(results.sniffWith));
  console.log("\n  Same bytes, same Content-Type, two outcomes. Without the header the");
  console.log("  browser is permitted to look at the content, decide it is really HTML,");
  console.log("  and render it — which means a user-uploaded file just became a page on");
  console.log("  YOUR origin, with access to your cookies and your DOM.");
  console.log("\n  This is why the header is one word and still worth knowing: it turns");
  console.log("  'the server is authoritative about content types' from a convention");
  console.log("  into a rule. Serve user uploads from a separate origin as well, so");
  console.log("  that even a successful sniff lands somewhere harmless.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — CLICKJACKING, EXECUTED
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — who is allowed to put your page in an iframe ══\n");

  const configs = {
    "no header at all": null,
    "helmet default (SAMEORIGIN)": {},
    "XFO: DENY (CSP untouched)": { "x-frame-options": "DENY" },
    "CSP frame-ancestors 'none'": { "content-security-policy": "frame-ancestors 'none'" },
    "CSP allow-list (partner)": { "content-security-policy": "frame-ancestors https://partner.example" },
  };

  const table = {};
  for (const [label, opts] of Object.entries(configs)) {
    const app = miniExpress();
    if (opts !== null) app.use(helmet(opts));
    app.get("/bank", (req, res) => { res.setHeader("content-type", "text/html"); res.end("<h1>transfer</h1>"); });
    const { server, port } = await app.listen();
    const r = await request(port, "/bank");
    server.close();
    table[label] = {
      fromEvil: browserCanFrame(r.headers, EVIL, SITE),
      fromSelf: browserCanFrame(r.headers, SITE, SITE),
      fromPartner: browserCanFrame(r.headers, "https://partner.example", SITE),
    };
  }

  results.framing = table;

  console.log("  configuration                    evil.example   app.example   partner.example");
  console.log("  ─────────────────────────────────────────────────────────────────────────────");
  for (const [label, v] of Object.entries(table)) {
    console.log("  " + label.padEnd(33) +
      (v.fromEvil.allowed ? "FRAMED 🐛" : "blocked  ").padEnd(15) +
      (v.fromSelf.allowed ? "framed" : "blocked").padEnd(14) +
      (v.fromPartner.allowed ? "framed" : "blocked"));
  }
  console.log("\n  Row 1 is the clickjacking setup: evil.example loads your transfer page");
  console.log("  in an invisible iframe, overlays its own 'Play video' button on top of");
  console.log("  your 'Confirm' button, and the click the user thinks they are giving to");
  console.log("  the video is delivered to your page — with their session cookies");
  console.log("  attached, because it is a normal same-site request to you.");
  console.log("\n  Row 3 is a real bug worth staring at. X-Frame-Options was set to");
  console.log("  DENY — and the page is still framable by its own origin, because");
  console.log("  helmet's default CSP still says frame-ancestors 'self', and WHEN BOTH");
  console.log("  ARE PRESENT, CSP WINS. Changing the legacy header alone changed");
  console.log("  nothing. That is the shape of a whole class of security-config bug:");
  console.log("  two headers for one control, and the one you edited is the ignored one.");
  console.log("\n  Rows 4 and 5 are the modern control. frame-ancestors takes an");
  console.log("  allow-list, which X-Frame-Options never supported properly, so a");
  console.log("  legitimate partner embed is expressible without disabling anything.");
  console.log("  Set both — the legacy header still covers very old clients — but set");
  console.log("  them CONSISTENTLY, and treat CSP as the source of truth.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — CSP: FOUR POLICIES, FIVE RESOURCES
// ══════════════════════════════════════════════════════════════════
//
// CSP is the only header here that needs thought, and the only one that can
// break your own site. Here is what each policy actually permits.

function section7() {
  console.log("\n══ § 7 — evaluating Content-Security-Policy ══\n");

  const policies = {
    "no CSP":                      "",
    "default-src 'self'":          "default-src 'self'",
    "…with 'unsafe-inline'":       "default-src 'self'; script-src 'self' 'unsafe-inline'",
    "…with a CDN allowed":         "default-src 'self'; script-src 'self' https://cdn.example",
  };

  const resources = {
    "your own /app.js":            { kind: "external", origin: SITE },
    "https://cdn.example/lib.js":  { kind: "external", origin: "https://cdn.example" },
    "injected evil.example/x.js":  { kind: "external", origin: EVIL },
    "inline <script> (yours)":     { kind: "inline" },
    "injected inline <script>":    { kind: "inline" },
  };

  const table = {};
  for (const [pLabel, policy] of Object.entries(policies)) {
    table[pLabel] = {};
    for (const [rLabel, resource] of Object.entries(resources)) {
      table[pLabel][rLabel] = cspAllowsScript(policy, resource, SITE);
    }
  }
  results.cspTable = table;

  const rNames = Object.keys(resources);
  console.log("  policy                    " + rNames.map((n) => n.slice(0, 13).padEnd(15)).join(""));
  console.log("  " + "─".repeat(26 + 15 * rNames.length));
  for (const [pLabel, row] of Object.entries(table)) {
    console.log("  " + pLabel.padEnd(26) +
      rNames.map((n) => (row[n].allowed ? "RUNS" : "blocked").padEnd(15)).join(""));
  }

  console.log("\n  Read the second row: 'default-src self' blocks the injected external");
  console.log("  script AND both inline scripts. That is the protection — and it is also");
  console.log("  why the policy breaks a normal app, because your own inline scripts and");
  console.log("  your CDN are in the blocked column too.");
  console.log("\n  Row three is the mistake everyone makes. Adding 'unsafe-inline' to fix");
  console.log("  your own inline script also un-blocks the INJECTED one — the two are");
  console.log("  indistinguishable to the browser. A CSP with 'unsafe-inline' in");
  console.log("  script-src provides no XSS protection at all; it is a header that");
  console.log("  looks like a control in an audit and is not one.");
  console.log("\n  Row four is the right shape for external code: name the CDN. The");
  console.log("  injected origin is still blocked because it is not on the list.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE FIX FOR INLINE SCRIPTS: A NONCE
// ══════════════════════════════════════════════════════════════════
//
// One random value per response, in the header and on the tag. Yours has it;
// an injected script cannot, because the attacker never sees the header.

async function section8() {
  console.log("\n══ § 8 — nonce-based CSP ══\n");

  const app = miniExpress();
  app.use((req, res, next) => {
    res.locals = { nonce: crypto.randomBytes(16).toString("base64") };
    next();
  });
  app.use((req, res, next) => {
    helmet({
      "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-" + res.locals.nonce + "'",
    })(req, res, next);
  });
  app.get("/", (req, res) => {
    res.setHeader("content-type", "text/html");
    res.end('<script nonce="' + res.locals.nonce + '">init()</script>');
  });

  const { server, port } = await app.listen();
  const first = await request(port, "/");
  const second = await request(port, "/");
  server.close();

  const policy = first.headers["content-security-policy"];
  const nonce = /'nonce-([^']+)'/.exec(policy)[1];

  results.nonceOwnScript = cspAllowsScript(policy, { kind: "inline", nonce }, SITE);
  results.nonceInjected = cspAllowsScript(policy, { kind: "inline" }, SITE);
  results.nonceGuessed = cspAllowsScript(policy, { kind: "inline", nonce: "guessed-value" }, SITE);
  results.nonceIsPerResponse =
    first.headers["content-security-policy"] !== second.headers["content-security-policy"];

  console.log("  policy:", policy);
  console.log("\n  your inline script, correct nonce   →", JSON.stringify(results.nonceOwnScript));
  console.log("  injected inline script, no nonce    →", JSON.stringify(results.nonceInjected));
  console.log("  injected with a guessed nonce       →", JSON.stringify(results.nonceGuessed));
  console.log("  nonce differed between two responses:", results.nonceIsPerResponse);
  console.log("\n  That last line is the whole security property. The nonce must be:");
  console.log("   • cryptographically random (crypto.randomBytes, not Math.random),");
  console.log("   • regenerated per RESPONSE — a per-deploy constant is just a public");
  console.log("     password, since the attacker can read it from any page,");
  console.log("   • and never cached. A CDN caching an HTML page with a nonce in it");
  console.log("     serves a stale nonce and breaks every script.");
  console.log("\n  This is also why CSP is genuinely hard: it forces you to know where");
  console.log("  every script on your page comes from. That is the point — the header");
  console.log("  is a forcing function for an inventory you should have anyway.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT HELMET DOES NOT DO
// ══════════════════════════════════════════════════════════════════
//
// Three honest limits, each demonstrated rather than asserted.

async function section9() {
  console.log("\n══ § 9 — the limits ══\n");

  // (a) Helmet does not sanitise anything. The XSS still happens.
  const stored = [];
  const app = miniExpress();
  app.use(helmet());
  app.get("/comment", (req, res) => {
    const text = decodeURIComponent((req.url.split("?text=")[1] || ""));
    stored.push(text);                                   // 🐛 stored verbatim
    res.setHeader("content-type", "text/html");
    res.end("<div>" + text + "</div>");                  // 🐛 reflected verbatim
  });
  const { server, port } = await app.listen();
  const payload = "<script>steal()</script>";
  const r = await request(port, "/comment?text=" + encodeURIComponent(payload));
  server.close();

  results.xssStillStored = stored[0] === payload;
  results.xssStillInBody = r.body.includes(payload);
  results.xssBlockedByCsp = !cspAllowsScript(r.headers["content-security-policy"], { kind: "inline" }, SITE).allowed;

  console.log("  (a) helmet() is on. An XSS payload was submitted:");
  console.log("      stored in the database verbatim :", results.xssStillStored, " 🐛");
  console.log("      reflected into the HTML verbatim:", results.xssStillInBody, " 🐛");
  console.log("      would the browser EXECUTE it    :", !results.xssBlockedByCsp,
              results.xssBlockedByCsp ? " ← CSP blocked it ✅" : "");
  console.log("      The injection succeeded at every layer you control. CSP only");
  console.log("      stopped the last step, in the client. Escaping output is still");
  console.log("      your job; CSP is the seatbelt, not the brakes.");

  // (b) HSTS is useless on the very first visit.
  const hsts = HELMET_DEFAULTS["strict-transport-security"];
  results.hstsFirstVisit = {
    header: hsts,
    protectsFirstRequest: false,
    reason: "the header arrives IN a response — the first request already happened over http",
  };
  console.log("\n  (b) Strict-Transport-Security:", hsts);
  console.log("      protects the first ever request:", results.hstsFirstVisit.protectsFirstRequest, " 🐛");
  console.log("      Because the instruction travels in a response, the very first");
  console.log("      plain-http request is unprotected — that is exactly the request a");
  console.log("      man-in-the-middle wants. The fix beyond HSTS is the browser");
  console.log("      preload list, which ships the rule with the browser itself.");

  // (c) Helmet does not care who you are.
  results.helmetIsNotAuth = true;
  console.log("\n  (c) Not in scope at all: authentication, authorisation, input");
  console.log("      validation (→ 17_express-validator.js), rate limiting");
  console.log("      (→ 12), CSRF (→ 16 session management), SQL/NoSQL injection");
  console.log("      (→ 06 §7), dependency CVEs, or secrets management. Helmet sets");
  console.log("      headers. Fifteen headers is a good afternoon's work and about two");
  console.log("      percent of an application's security posture.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — helmet() registered below the routes, so successful responses
//   carry no security headers at all. Same shape as 10 §8. → 01 §4
//
// Bug 2 — CSP disabled entirely (`contentSecurityPolicy: false`) to fix a
//   broken page, then never re-enabled. → §7
//
// Bug 3 — 'unsafe-inline' added to script-src, which makes the policy
//   decorative: your inline script and the injected one are identical to
//   the browser. → §7
//
// Bug 4 — A nonce generated once at startup instead of per response. It is
//   readable from any page, so it is not a secret. → §8
//
// Bug 5 — HTML pages with nonces cached by a CDN, serving a stale nonce and
//   breaking every script on the page. → §8
//
// Bug 6 — Assuming HSTS protects the first visit. It cannot. → §9
//
// Bug 7 — User uploads served from the app's own origin with a
//   Content-Type the browser is allowed to override. → §5
//
// Bug 8 — Editing X-Frame-Options while CSP frame-ancestors is also set.
//   CSP wins, so the change does nothing and the audit ticket is closed on
//   a control that never moved. → §6
//
// Bug 8b — X-Frame-Options: SAMEORIGIN left in place while a legitimate
//   partner needs to embed you — the fix is frame-ancestors with an
//   allow-list, not removing the header. → §6
//
// Bug 9 — Treating `app.use(helmet())` as "we did security" in a review.
//   → §9
//
// Bug 10 — Setting headers on a response that already started, throwing
//   ERR_HTTP_HEADERS_SENT from inside the security middleware. → 07 §6


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 11 — assertions ══\n");

  // § 4 — headers added and removed:
  assert.equal(results.poweredByBare, "Express",
    "without helmet the response advertised the framework 🐛");
  assert.equal(results.poweredByHelmet, undefined, "…and helmet removed it ✅");
  assert.ok(results.headerCountAdded >= 11,
    "helmet added at least eleven security headers in one line ✅ (added " + results.headerCountAdded + ")");
  assert.equal(results.helmetHeaders["x-content-type-options"], "nosniff");
  assert.equal(results.helmetHeaders["x-frame-options"], "SAMEORIGIN");
  assert.equal(results.helmetHeaders["x-xss-protection"], "0",
    "…including one that turns the legacy XSS auditor OFF, on purpose");
  assert.ok(results.helmetHeaders["content-security-policy"].includes("default-src 'self'"));
  assert.equal(results.bareHeaders["content-security-policy"], undefined,
    "…none of which existed on the bare response");

  // § 5 — sniffing:
  assert.equal(results.sniffWithout.declared, "text/plain", "the server declared text/plain");
  assert.equal(results.sniffWithout.effective, "text/html",
    "…and without nosniff the browser sniffed it as HTML 🐛");
  assert.equal(results.sniffWithout.executesScript, true, "…which means the uploaded script would run 🐛");
  assert.equal(results.sniffWith.effective, "text/plain",
    "…while nosniff made the declared type final ✅");
  assert.equal(results.sniffWith.executesScript, false, "…and nothing executed");

  // § 6 — framing:
  const f = results.framing;
  assert.equal(f["no header at all"].fromEvil.allowed, true,
    "with no framing header, evil.example could iframe the page 🐛");
  assert.equal(f["helmet default (SAMEORIGIN)"].fromEvil.allowed, false,
    "…helmet's SAMEORIGIN default blocked it ✅");
  assert.equal(f["helmet default (SAMEORIGIN)"].fromSelf.allowed, true,
    "…while still allowing the site to frame itself");
  assert.equal(f["XFO: DENY (CSP untouched)"].fromEvil.allowed, false,
    "X-Frame-Options: DENY blocked the cross-origin frame…");
  assert.equal(f["XFO: DENY (CSP untouched)"].fromSelf.allowed, true,
    "…but same-origin framing STILL worked, because helmet's CSP frame-ancestors 'self' " +
    "overrides X-Frame-Options — editing the legacy header alone changed nothing 🐛");
  assert.equal(f["XFO: DENY (CSP untouched)"].fromSelf.by, "CSP 'self'",
    "…and the decision is attributable to CSP, not to the header that was edited");
  assert.equal(f["CSP frame-ancestors 'none'"].fromEvil.allowed, false);
  assert.equal(f["CSP frame-ancestors 'none'"].fromSelf.allowed, false,
    "…while changing the header that actually wins blocked framing completely ✅");
  assert.equal(f["CSP allow-list (partner)"].fromPartner.allowed, true,
    "frame-ancestors supports an allow-list ✅");
  assert.equal(f["CSP allow-list (partner)"].fromEvil.allowed, false,
    "…that still excludes everyone else");

  // § 7 — CSP evaluation:
  const c = results.cspTable;
  assert.equal(c["no CSP"]["injected evil.example/x.js"].allowed, true,
    "with no CSP an injected external script runs 🐛");
  assert.equal(c["no CSP"]["injected inline <script>"].allowed, true, "…as does an injected inline one 🐛");
  assert.equal(c["default-src 'self'"]["injected evil.example/x.js"].allowed, false,
    "default-src 'self' blocked the injected external script ✅");
  assert.equal(c["default-src 'self'"]["injected inline <script>"].allowed, false,
    "…and the injected inline script ✅");
  assert.equal(c["default-src 'self'"]["inline <script> (yours)"].allowed, false,
    "…but it blocked YOUR inline script too, which is why the policy breaks apps 🐛");
  assert.equal(c["…with 'unsafe-inline'"]["inline <script> (yours)"].allowed, true,
    "'unsafe-inline' un-blocked your script ✅…");
  assert.equal(c["…with 'unsafe-inline'"]["injected inline <script>"].allowed, true,
    "…and un-blocked the INJECTED one identically — the policy is now decorative 🐛");
  assert.equal(c["…with a CDN allowed"]["https://cdn.example/lib.js"].allowed, true,
    "naming the CDN allowed it ✅");
  assert.equal(c["…with a CDN allowed"]["injected evil.example/x.js"].allowed, false,
    "…without allowing anything else");

  // § 8 — nonces:
  assert.equal(results.nonceOwnScript.allowed, true, "the nonce let YOUR inline script run ✅");
  assert.equal(results.nonceOwnScript.by, "matching nonce");
  assert.equal(results.nonceInjected.allowed, false,
    "…while an injected inline script with no nonce stayed blocked ✅");
  assert.equal(results.nonceGuessed.allowed, false, "…and a wrong nonce did not help");
  assert.equal(results.nonceIsPerResponse, true,
    "…and the nonce was regenerated per response, which is what makes it a secret ✅");

  // § 9 — limits:
  assert.equal(results.xssStillStored, true,
    "helmet did not stop the XSS payload being stored 🐛");
  assert.equal(results.xssStillInBody, true, "…nor being reflected into the HTML 🐛");
  assert.equal(results.xssBlockedByCsp, true,
    "…CSP only stopped the browser from EXECUTING it — the last step of five ✅");
  assert.equal(results.hstsFirstVisit.protectsFirstRequest, false,
    "HSTS cannot protect the first request, because it arrives in a response 🐛");

  console.log("§11 — mini assertions passed for: Helmet.js security headers");
  console.log("\n  The pair that captures it: adding 'unsafe-inline' un-blocked your own");
  console.log("  inline script and the injected one identically — and with helmet fully");
  console.log("  enabled, the XSS payload was still stored and still reflected. Helmet");
  console.log("  changes what the browser will DO with a payload, never whether one");
  console.log("  arrives.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what does Helmet do?", answer:
//
//   "It's about fifteen small middlewares that set security-related response
//    headers, plus one that removes X-Powered-By. The important framing is
//    that none of it inspects a request or filters anything — every one of
//    those headers is an instruction to the browser, and the browser is what
//    enforces it. Same model as CORS.
//
//    The ones I'd actually name: X-Content-Type-Options: nosniff, which
//    stops the browser overriding my Content-Type — without it a
//    user-uploaded .txt containing HTML can be sniffed and rendered as a
//    page on my own origin. X-Frame-Options or CSP frame-ancestors, which
//    is clickjacking: without it any site can iframe my page invisibly and
//    harvest clicks that arrive with the user's cookies attached.
//    Strict-Transport-Security, with the honest caveat that it does nothing
//    on the first visit, because the instruction arrives in a response —
//    that's what the preload list is for. And Referrer-Policy, so URLs
//    containing tokens don't leak to third parties.
//
//    The one that needs real work is Content-Security-Policy. Helmet's
//    default is default-src 'self', which blocks injected scripts and also
//    blocks your own inline scripts and your CDN — so people add
//    'unsafe-inline' to fix their page, and that hands the whole mechanism
//    back, because the browser cannot tell your inline script from an
//    injected one. The correct fix is a per-response nonce: random bytes in
//    the header and on the tag, regenerated every response so an attacker
//    who can inject HTML still can't produce a matching nonce. A nonce fixed
//    at deploy time is just a public password, and a CDN caching HTML with a
//    nonce in it breaks the page.
//
//    And I'd be careful about how it's counted in a review. With helmet
//    fully enabled I can still store an XSS payload and reflect it into the
//    HTML — CSP only stops the last step, in the client. Escaping output,
//    validating input, authorisation, rate limiting and dependency hygiene
//    are all still open."
//
// Naming what Helmet does NOT cover is what makes this a senior answer.
// Everyone can list headers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is Helmet, mechanically?
// A1. A bundle of middlewares that call res.setHeader, plus removeHeader for
//     x-powered-by (§4).
//
// Q2. Who enforces those headers?
// A2. The browser. Nothing is filtered server-side (§2, §9).
//
// Q3. What does nosniff prevent?
// A3. The browser overriding your Content-Type by inspecting bytes — which
//     can turn an upload into an HTML page on your origin (§5).
//
// Q4. X-Frame-Options vs CSP frame-ancestors?
// A4. Same purpose; frame-ancestors is modern, supports allow-lists, and
//     WINS when both are present — proven in §6, where setting XFO to DENY
//     changed nothing because the CSP still said 'self'. Keep both, set them
//     consistently, treat CSP as the source of truth.
//
// Q5. What does 'unsafe-inline' cost you?
// A5. The entire XSS protection of the policy — injected and legitimate
//     inline scripts become indistinguishable (§7).
//
// Q6. How do you keep inline scripts and a real CSP?
// A6. A per-response cryptographic nonce, or hashes for static inline
//     blocks (§8).
//
// Q7. Why must the nonce be per response?
// A7. Anyone can read it from the page; a reused one is public (§8).
//
// Q8. Why does a CDN break nonces?
// A8. It caches the HTML, so a stale nonce is served with a fresh header —
//     or vice versa (§8).
//
// Q9. Does HSTS protect the first request?
// A9. No. Use the preload list for that (§9).
//
// Q10. Why does Helmet set X-XSS-Protection to 0?
// A10. The legacy browser auditor introduced its own vulnerabilities;
//      disabling it is now the recommendation (§4).
//
// Q11. What is Content-Security-Policy-Report-Only for?
// A11. Shipping a policy that reports violations without enforcing them —
//      the only sane way to roll CSP onto an existing app.
//
// Q12. Does Helmet stop XSS?
// A12. No. It can stop the payload from executing if CSP is strict. The
//      injection still happens (§9).
//
// Q13. Where does helmet() go in the stack?
// A13. First, above cors, routes and static — it can only set headers on
//      responses it reaches (§10 Bug 1, 01 §4).
//
// Q14. Is x-powered-by removal a security control?
// A14. Marginal — obscurity, not defence. It costs nothing, so do it, but
//      never count it (§4).


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does Helmet actually do?
//   Back : Sets ~15 response headers, removes x-powered-by. Nothing else.
//
// Flashcard 2:
//   Front: Who enforces them?
//   Back : The browser.
//
// Flashcard 3:
//   Front: nosniff stops what?
//   Back : The browser overriding your Content-Type from the bytes.
//
// Flashcard 4:
//   Front: Clickjacking header — and which wins?
//   Back : X-Frame-Options and CSP frame-ancestors. CSP wins when both
//          are present, so editing XFO alone can be a no-op.
//
// Flashcard 5:
//   Front: Cost of 'unsafe-inline'?
//   Back : The CSP stops protecting against XSS entirely.
//
// Flashcard 6:
//   Front: Inline scripts with a strict CSP?
//   Back : Per-response random nonce (or a hash).
//
// Flashcard 7:
//   Front: HSTS on a first visit?
//   Back : No protection. Preload list solves it.
//
// Flashcard 8:
//   Front: X-XSS-Protection: 0 — why?
//   Back : The legacy auditor was itself exploitable.
//
// Flashcard 9:
//   Front: Rolling CSP onto an old app?
//   Back : Content-Security-Policy-Report-Only first.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "Helmet changes what the browser will DO with a payload — never
//          whether one arrives."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Extend the CSP evaluator to handle style-src and img-src, then evaluate
//   helmet's real default policy against a page with an inline <style>.
//
// Task 2:
//   Implement Content-Security-Policy-Report-Only alongside the enforcing
//   header and collect violations at a /csp-report endpoint.
//
// Task 3:
//   Add hash-based CSP ('sha256-…') for a static inline script and prove it
//   is allowed without a nonce. When is a hash better than a nonce?
//
// Task 4:
//   Reproduce §5 with a served .svg containing a script. Why is SVG the
//   sharpest version of the sniffing problem?
//
// Task 5:
//   Build the clickjacking page: an HTML file with an iframe of §6's /bank
//   and a button overlay. Serve it, then add helmet and watch it break.
//
// Task 6:
//   Measure the byte cost of helmet's headers on a small JSON response.
//   At what response size does the overhead stop mattering?
//
// Task 7:
//   Write a middleware that fails CI if any response leaves without
//   x-content-type-options — a test, not a header.
//
// Task 8:
//   Compare Referrer-Policy values by simulating what the Referer header
//   would contain for a cross-origin navigation from a URL with a token in
//   the query string.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Helmet sets response headers. The browser enforces them. Nothing is
//   validated, filtered or blocked on your server.
//
// If you remember the common bug:
//   'unsafe-inline' in script-src, added to fix your own page, which makes
//   the CSP indistinguishable between your script and an injected one.
//
// If you remember the professional framing:
//   helmet() first in the stack; the fourteen non-CSP headers are correct by
//   default; CSP gets a real policy with per-response nonces, rolled out
//   with Report-Only first; and none of it substitutes for escaping output.
//
// ─────────────────────────────────────────────────────────────────
// Helmet hardens the browser's behaviour. It has nothing to say about a
// client that simply asks for the same endpoint ten thousand times a second
// — which is the next file, and the first middleware in this group that has
// to keep state.
//
// NEXT TOPIC -> 12_rate-limiting-express-rate-limit.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  section7();
  await section8();
  await section9();
  assertions();
})();
