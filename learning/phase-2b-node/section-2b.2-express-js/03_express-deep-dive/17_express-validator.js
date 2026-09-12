// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  17_express-validator.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: express-validator
//
// WHAT YOU WILL MASTER HERE:
//   1. The mistake that makes the whole library decorative: chains that run
//      and record errors while the handler never asks for them — proven with
//      an invalid user written to the database
//   2. Validators versus sanitizers: one reports, the other MUTATES req.body
//      — measured before and after
//   3. Chain ORDER changing the outcome, because sanitizers rewrite the
//      value the next validator sees
//   4. The shape check that kills 06 §7's NoSQL injection and 13 §8's
//      prototype pollution in one line
//   5. matchedData(): why an allow-list is the only defence against mass
//      assignment, with a user promoting themselves to admin to prove it
//   6. Collecting every error versus failing on the first, and what a good
//      400 body looks like
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/17_express-validator.js"
//
// Prerequisites: 06_route-params-vs-query-params.js §5 and §7 (everything is
// a string, and the caller chooses the type), 13_body-parsing-json-urlencoded.js
// §8 (prototype pollution), and 03 (errors reaching a 4-argument handler).
// This file is the answer those three kept pointing at.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// express-validator:
// a set of middleware "chains" — body('email').isEmail().normalizeEmail() —
// that read a named value from a specific part of the request, run
// validators and sanitizers over it in order, record any failures on the
// request, and leave it to YOU to inspect the result with
// validationResult(req) and decide what to do.
//
// If interviewer says "explain it simply", say:
//   "Each chain is a middleware. It picks one field out of req.body,
//    req.query, req.params or the headers, runs the checks you listed, and
//    stores failures on the request. Sanitizers in the same chain actually
//    rewrite the value in place. Then, in the handler, validationResult(req)
//    gives you the collected errors."
//
// If interviewer says "where do people get it wrong?", say:
//   "They register the chains and never call validationResult. The chains
//    run, the errors are recorded, and the handler proceeds anyway — so the
//    code LOOKS validated in review and validates nothing. It's the same
//    class of silent failure as a middleware that forgets next(): no error,
//    no log, wrong behaviour."
//
// Why it matters in interviews:
//   Validation is the layer that answers three of this group's open
//   problems at once: type confusion from the query parser, prototype
//   pollution from body parsing, and mass assignment. Being able to say
//   which attacks a schema closes is more valuable than listing validators.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   CHAINS RECORD. YOU DECIDE. SANITIZERS MUTATE.
//
// Runtime rule:
//   A chain is a middleware that always calls next(), whether the field was
//   valid or not. Nothing rejects a request by itself. The rejection is a
//   separate step you write, reading validationResult(req).
//
// Practical rule:
//   One validation array per route, a shared handleValidation middleware
//   immediately after it that 400s on any error, and matchedData() — never
//   raw req.body — as the input to whatever writes to the database.
//
// Common trap:
//   Validating that a field is present and well-formed while ignoring the
//   fields you did not mention. Unknown keys are the attack surface, and a
//   validator that only inspects known fields does nothing about them.
//
// The mental picture:
//
//   POST /users  { email: " ADA@Example.COM ", age: "30", role: "admin" }
//        │
//   body('email').trim().isEmail().normalizeEmail()   → req.body.email rewritten
//   body('age').isInt({min:13}).toInt()               → req.body.age becomes 30
//        │        └── failures recorded on req, NOT thrown
//        ▼
//   handleValidation → validationResult(req) → any errors? 400 : next()
//        ▼
//   matchedData(req) → { email, age }      ← 'role' was never declared,
//                                            so it never reaches your code


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILDING THE CHAIN API
// ══════════════════════════════════════════════════════════════════

const LOCATIONS = {
  body: (req) => req.body,
  query: (req) => req.query,
  params: (req) => req.params,
  headers: (req) => req.headers,
};

function makeChain(location, fieldName) {
  const steps = [];
  let isOptional = false;

  const chain = (req, res, next) => {
    const container = LOCATIONS[location](req) || {};
    let value = container[fieldName];

    req._validationErrors ||= [];
    req._matched ||= {};

    if (value === undefined && isOptional) return next();

    for (const step of steps) {
      if (step.kind === "sanitize") {
        value = step.fn(value);
        container[fieldName] = value;              // ← MUTATION (§5)
        continue;
      }
      let ok;
      try { ok = step.fn(value); } catch { ok = false; }
      if (!ok) {
        req._validationErrors.push({
          location, path: fieldName, value, msg: step.message,
        });
        return next();                              // record and CONTINUE (§4)
      }
    }
    req._matched[fieldName] = value;                // only declared fields (§7)
    next();
  };

  const validate = (fn, message) => { steps.push({ kind: "validate", fn, message }); return chain; };
  const sanitize = (fn) => { steps.push({ kind: "sanitize", fn }); return chain; };

  Object.assign(chain, {
    optional() { isOptional = true; return chain; },
    // ── validators ──
    exists: (m = "field is required") => validate((v) => v !== undefined && v !== null, m),
    isString: (m = "must be a string") => validate((v) => typeof v === "string", m),
    notEmpty: (m = "must not be empty") => validate((v) => typeof v === "string" && v.length > 0, m),
    isEmail: (m = "must be a valid email") =>
      validate((v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), m),
    isLength: ({ min = 0, max = Infinity }, m = "wrong length") =>
      validate((v) => typeof v === "string" && v.length >= min && v.length <= max,
        m === "wrong length" ? "must be between " + min + " and " + max + " characters" : m),
    isInt: ({ min = -Infinity, max = Infinity } = {}, m = null) =>
      validate((v) => /^-?\d+$/.test(String(v)) && Number(v) >= min && Number(v) <= max,
        m || (min !== -Infinity && max !== Infinity ? "must be an integer between " + min + " and " + max
            : min !== -Infinity ? "must be an integer of at least " + min
            : max !== Infinity ? "must be an integer of at most " + max
            : "must be an integer")),
    isIn: (list, m = null) =>
      validate((v) => list.includes(v), m || "must be one of: " + list.join(", ")),
    custom: (fn, m = "failed a custom check") => validate(fn, m),
    // ── sanitizers ──
    trim: () => sanitize((v) => (typeof v === "string" ? v.trim() : v)),
    toLowerCase: () => sanitize((v) => (typeof v === "string" ? v.toLowerCase() : v)),
    toInt: () => sanitize((v) => (/^-?\d+$/.test(String(v)) ? parseInt(v, 10) : v)),
    escape: () => sanitize((v) =>
      typeof v === "string"
        ? v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        : v),
    default: (d) => sanitize((v) => (v === undefined || v === "" ? d : v)),
  });

  return chain;
}

const body = (f) => makeChain("body", f);
const query = (f) => makeChain("query", f);
const param = (f) => makeChain("params", f);

function validationResult(req) {
  const errors = req._validationErrors || [];
  return {
    isEmpty: () => errors.length === 0,
    array: () => errors.slice(),
    mapped: () => Object.fromEntries(errors.map((e) => [e.path, e])),
  };
}

// The allow-list: only fields a chain declared AND validated (§7).
const matchedData = (req) => ({ ...(req._matched || {}) });

// The rejection step people forget to write (§4).
const handleValidation = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  res.statusCode = 422;
  res.setHeader("content-type", "application/json");
  return res.end(JSON.stringify({
    error: "validation failed",
    details: result.array().map(({ location, path, msg }) => ({ location, path, msg })),
  }));
};

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    post(path, ...fns) { for (const fn of fns) stack.push({ path, method: "POST", fn }); return app; },
    get(path, ...fns) { for (const fn of fns) stack.push({ path, method: "GET", fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const [urlPath, qs] = req.url.split("?");
          req.query = Object.fromEntries(new URLSearchParams(qs || ""));
          // bracket syntax, extended-style (06 §6) — so §6's attack is realistic
          for (const [k, v] of [...new URLSearchParams(qs || "")]) {
            const m = /^([^[\]]+)\[([^[\]]+)\]$/.exec(k);
            if (m) { req.query[m[1]] = { ...(typeof req.query[m[1]] === "object" ? req.query[m[1]] : {}), [m[2]]: v }; delete req.query[k]; }
          }
          req.params = {};
          let raw = "";
          req.setEncoding("utf8");
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
            let i = 0;
            (function next() {
              const layer = stack[i++];
              if (!layer) { res.statusCode = 404; return res.end("not found"); }
              if (layer.path && (layer.path !== urlPath || layer.method !== req.method)) return next();
              layer.fn(req, res, next);
            })();
          });
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

function request(port, path, { method = "POST", body: payload = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = payload === null ? "" : JSON.stringify(payload);
    const req = http.request({
      host: "127.0.0.1", port, path, method,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) },
    }, (res) => {
      let out = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject);
    req.end(data);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE CHAIN THAT VALIDATES NOTHING
// ══════════════════════════════════════════════════════════════════
//
// The single most common express-validator bug, and it is invisible in code
// review because the chains are right there in the route definition.

async function section4() {
  console.log("\n══ § 4 — chains record; they do not reject ══\n");

  const forgetful = [];
  const correct = [];

  const app = miniExpress();

  // 🐛 chains present, validationResult never consulted
  app.post("/users-bad",
    body("email").isEmail(),
    body("age").isInt({ min: 13 }),
    (req, res) => {
      forgetful.push(req.body);                       // straight to the "database"
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ created: true, saved: req.body }));
    });

  // ✅ identical chains, plus the step that acts on them
  app.post("/users-good",
    body("email").isEmail(),
    body("age").isInt({ min: 13 }),
    handleValidation,
    (req, res) => {
      correct.push(req.body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ created: true }));
    });

  const { server, port } = await app.listen();

  const junk = { email: "not-an-email", age: "-5" };
  const bad = await request(port, "/users-bad", { body: junk });
  const good = await request(port, "/users-good", { body: junk });
  const savedAfterInvalid = correct.length;        // measured BEFORE the valid request
  const valid = await request(port, "/users-good", { body: { email: "ada@example.com", age: "30" } });

  server.close();

  results.forgetful = { status: bad.status, saved: forgetful.length, row: forgetful[0] ?? null };
  results.correct = { status: good.status, body: JSON.parse(good.body), saved: savedAfterInvalid };
  results.correctSavedValid = correct.length;
  results.validAccepted = valid.status;

  console.log("  POST invalid data to the route WITHOUT handleValidation:");
  console.log("    response:", bad.status, bad.body);
  console.log("    rows written:", results.forgetful.saved, " 🐛", JSON.stringify(results.forgetful.row));
  console.log("\n  the same data to the route WITH handleValidation:");
  console.log("    response:", good.status);
  console.log("   ", JSON.stringify(results.correct.body, null, 0));
  console.log("    rows written:", results.correct.saved, " ✅");
  console.log("\n  valid data through the same route:", valid.status,
              "— rows written now:", results.correctSavedValid, " ✅");
  console.log("\n  The two routes list the SAME chains. The difference is one middleware.");
  console.log("  A chain always calls next() — it records failures on the request and");
  console.log("  gets out of the way, exactly like a body parser attaching req.body.");
  console.log("  Deciding what a failure means is deliberately your job, because a form");
  console.log("  wants a field-by-field 422 and an internal API might want to log and");
  console.log("  continue.");
  console.log("\n  The practical consequence: `handleValidation` must be a shared");
  console.log("  middleware you cannot forget, not a copy-pasted `if` in every handler.");
  console.log("  The version where you can forget it is the version that ships.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — SANITIZERS MUTATE, AND ORDER DECIDES THE OUTCOME
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — the request object is rewritten under you ══\n");

  const seen = {};
  const app = miniExpress();

  app.post("/normalise",
    (req, res, next) => { seen.before = JSON.parse(JSON.stringify(req.body)); next(); },
    body("email").trim().toLowerCase().isEmail(),
    body("age").isInt({ min: 13 }).toInt(),
    body("bio").default("(none)").escape(),
    handleValidation,
    (req, res) => {
      seen.after = req.body;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        body: req.body,
        ageType: typeof req.body.age,
        matched: matchedData(req),
      }));
    });

  // order matters: trim BEFORE isEmail passes; isEmail BEFORE trim fails
  app.post("/order-right", body("email").trim().isEmail(), handleValidation,
    (req, res) => res.end(JSON.stringify({ ok: true, email: req.body.email })));
  app.post("/order-wrong", body("email").isEmail().trim(), handleValidation,
    (req, res) => res.end(JSON.stringify({ ok: true, email: req.body.email })));

  const { server, port } = await app.listen();

  const payload = { email: "  ADA@Example.COM  ", age: "30", bio: "<script>x</script>" };
  const r = JSON.parse((await request(port, "/normalise", { body: payload })).body);
  const right = await request(port, "/order-right", { body: { email: " ada@example.com " } });
  const wrong = await request(port, "/order-wrong", { body: { email: " ada@example.com " } });

  server.close();

  results.sanitize = {
    before: seen.before,
    after: r.body,
    ageType: r.ageType,
    orderRight: right.status,
    orderWrong: wrong.status,
  };

  console.log("  req.body BEFORE the chains:", JSON.stringify(seen.before));
  console.log("  req.body AFTER  the chains:", JSON.stringify(r.body));
  console.log("  typeof req.body.age       :", r.ageType, " ← no longer a string (06 §5) ✅");
  console.log("\n  chain order, same input '  ada@example.com  ':");
  console.log("    .trim().isEmail()  →", right.status, " ✅ trimmed first, then valid");
  console.log("    .isEmail().trim()  →", wrong.status, " 🐛 validated the untrimmed value");
  console.log("\n  Two things worth internalising:");
  console.log("   • Sanitizers write back into req.body. Everything downstream — your");
  console.log("     handler, your ORM, your logs — sees the sanitised value, which is");
  console.log("     the point, and is also why a sanitizer that is too aggressive");
  console.log("     silently changes stored data.");
  console.log("   • The chain runs in the order you wrote it, so a sanitizer placed");
  console.log("     after a validator did not help that validator. Sanitize first,");
  console.log("     validate second, coerce types last.");
  console.log("\n  And .escape() deserves a caveat: HTML-escaping on INPUT means you have");
  console.log("  stored escaped text, which is wrong the moment that data is rendered");
  console.log("  anywhere that is not HTML — a JSON API, a CSV export, an email subject.");
  console.log("  Escape on OUTPUT, for the context you are rendering into. Store the");
  console.log("  truth.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE SHAPE CHECK THAT CLOSES TWO EARLIER ATTACKS
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — one isString() against 06 §7 and 13 §8 ══\n");

  const found = [];
  function findUser(criteria) {
    const users = [{ user: "alice", role: "user" }, { user: "root", role: "admin" }];
    return users.filter((u) =>
      Object.entries(criteria).every(([k, v]) =>
        v && typeof v === "object" && "$ne" in v ? u[k] !== v.$ne : u[k] === v));
  }

  const app = miniExpress();

  app.get("/search-unvalidated", (req, res) => {
    const users = findUser({ user: req.query.user });
    found.push(users.length);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ count: users.length, users: users.map((u) => u.user) }));
  });

  app.get("/search-validated",
    query("user").isString("user must be a string").notEmpty().isLength({ min: 1, max: 40 }),
    handleValidation,
    (req, res) => {
      const users = findUser({ user: req.query.user });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ count: users.length, users: users.map((u) => u.user) }));
    });

  // prototype pollution: a __proto__ key that a whitelist never copies
  app.post("/profile",
    body("name").isString().isLength({ min: 1, max: 50 }),
    handleValidation,
    (req, res) => {
      const profile = { ...matchedData(req) };            // ✅ allow-list, not a merge
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ profile, keys: Object.keys(profile) }));
    });

  const { server, port } = await app.listen();

  const honest = JSON.parse((await request(port, "/search-unvalidated?user=alice", { method: "GET" })).body);
  const injected = JSON.parse((await request(port, "/search-unvalidated?user[$ne]=nobody", { method: "GET" })).body);
  const blocked = await request(port, "/search-validated?user[$ne]=nobody", { method: "GET" });
  const okValidated = JSON.parse((await request(port, "/search-validated?user=alice", { method: "GET" })).body);

  const polluted = JSON.parse((await request(port, "/profile", {
    body: JSON.parse('{"name":"ada","__proto__":{"isAdmin":true},"role":"admin"}'),
  })).body);

  server.close();

  results.injection = {
    honestCount: honest.count,
    injectedCount: injected.count,
    blockedStatus: blocked.status,
    blockedBody: JSON.parse(blocked.body),
    validatedCount: okValidated.count,
  };
  results.pollutionKeys = polluted.keys;
  results.prototypeClean = {}.isAdmin === undefined;

  console.log("  unvalidated  ?user=alice          →", JSON.stringify(honest));
  console.log("  unvalidated  ?user[$ne]=nobody    →", JSON.stringify(injected), " 🐛 every user");
  console.log("  validated    ?user[$ne]=nobody    →", blocked.status,
              JSON.stringify(results.injection.blockedBody.details), " ✅");
  console.log("  validated    ?user=alice          →", JSON.stringify(okValidated), " ✅ still works");
  console.log("\n  POST { name, __proto__:{isAdmin}, role:'admin' } through a chain that");
  console.log("  declares only 'name':");
  console.log("    keys that reached the handler:", JSON.stringify(results.pollutionKeys));
  console.log("    Object.prototype still clean  :", results.prototypeClean, " ✅");
  console.log("\n  06 §7 showed the caller choosing the TYPE of a value; 13 §8 showed a");
  console.log("  __proto__ key reaching a merge. Both are the same underlying problem:");
  console.log("  data whose SHAPE nobody asserted. A single isString() closes the first,");
  console.log("  and building the object from matchedData() instead of merging req.body");
  console.log("  closes the second — not by blocking __proto__, but by never copying a");
  console.log("  key that was not declared.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — MASS ASSIGNMENT: THE FIELDS YOU DID NOT MENTION
// ══════════════════════════════════════════════════════════════════
//
// Validation that only inspects known fields leaves unknown ones untouched
// — and Object.assign does not care which is which.

async function section7() {
  console.log("\n══ § 7 — a user promoting themselves ══\n");

  const db = { 1: { id: 1, email: "ada@example.com", name: "Ada", role: "user", credits: 10 } };
  const saved = {};

  const app = miniExpress();

  const chains = [
    body("name").isString().isLength({ min: 1, max: 50 }),
    body("email").optional().trim().toLowerCase().isEmail(),
  ];

  app.post("/profile-naive", ...chains, handleValidation, (req, res) => {
    const user = { ...db[1] };
    Object.assign(user, req.body);                      // 🐛 whatever arrived
    saved.naive = user;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(user));
  });

  app.post("/profile-allowlist", ...chains, handleValidation, (req, res) => {
    const user = { ...db[1], ...matchedData(req) };     // ✅ only declared fields
    saved.allowlist = user;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(user));
  });

  const { server, port } = await app.listen();

  const attack = { name: "Ada", role: "admin", credits: 999999, id: 2 };
  const naive = JSON.parse((await request(port, "/profile-naive", { body: attack })).body);
  const allowlisted = JSON.parse((await request(port, "/profile-allowlist", { body: attack })).body);

  server.close();

  results.massAssignment = {
    sent: attack,
    naive: { role: naive.role, credits: naive.credits, id: naive.id },
    allowlist: { role: allowlisted.role, credits: allowlisted.credits, id: allowlisted.id },
    naiveValidationPassed: true,
  };

  console.log("  the request body:", JSON.stringify(attack));
  console.log("  …and it PASSES validation — 'name' is a valid string, 'email' is");
  console.log("  optional and absent. Nothing was violated.\n");
  console.log("  Object.assign(user, req.body) →", JSON.stringify(results.massAssignment.naive), " 🐛");
  console.log("  { ...user, ...matchedData(req) } →", JSON.stringify(results.massAssignment.allowlist), " ✅");
  console.log("\n  Read the first result: role admin, credits 999999, and a changed");
  console.log("  primary key — from a request that a validator approved. Validation and");
  console.log("  authorisation are different questions, and 'is this field well-formed'");
  console.log("  never answers 'is this user allowed to set this field'.");
  console.log("\n  Three habits that prevent it:");
  console.log("   • Build the update from matchedData(), never from req.body. Fields you");
  console.log("     did not declare cannot arrive by definition.");
  console.log("   • Keep privilege fields out of the same endpoint entirely — a role");
  console.log("     change is POST /users/:id/role with its own authorisation, not a");
  console.log("     key in a profile update.");
  console.log("   • If your ORM has a strict/allow-list mode, turn it on. Two defences");
  console.log("     at different layers is the difference between a bug and an incident.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — ERROR SHAPE: ALL OF THEM, OR THE FIRST ONE
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — what a good 400 body looks like ══\n");

  const app = miniExpress();
  const chains = [
    body("email").trim().isEmail(),
    body("password").isString().isLength({ min: 12 }),
    body("age").isInt({ min: 13, max: 120 }),
    body("plan").isIn(["free", "pro", "team"]),
  ];

  app.post("/signup-all", ...chains, handleValidation, (req, res) => res.end('{"ok":true}'));

  app.post("/signup-first", ...chains, (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    res.statusCode = 422;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: result.array()[0].msg }));      // first only
  }, (req, res) => res.end('{"ok":true}'));

  const { server, port } = await app.listen();

  const bad = { email: "nope", password: "short", age: "200", plan: "enterprise" };
  const all = JSON.parse((await request(port, "/signup-all", { body: bad })).body);
  const first = JSON.parse((await request(port, "/signup-first", { body: bad })).body);
  const ok = await request(port, "/signup-all", {
    body: { email: "ada@example.com", password: "correct-horse-battery", age: "30", plan: "pro" },
  });

  server.close();

  results.errorShape = { all, first, okStatus: ok.status };

  console.log("  four invalid fields, reporting ALL:");
  for (const d of all.details) console.log("    " + d.location + "." + d.path + ": " + d.msg);
  console.log("\n  the same request, reporting only the FIRST:");
  console.log("   ", JSON.stringify(first));
  console.log("\n  a fully valid request:", ok.status, " ✅");
  console.log("\n  Report all of them. A form that reveals one problem per round trip");
  console.log("  makes a four-field mistake into four submissions, and users abandon");
  console.log("  signup flows over exactly this.");
  console.log("\n  Two more decisions worth making deliberately:");
  console.log("   • 400 vs 422. 400 means the request was malformed — unparseable JSON");
  console.log("     (13 §8). 422 means it parsed fine and the CONTENT was unacceptable,");
  console.log("     which is what a validation failure is. Either is defensible; be");
  console.log("     consistent, and document it.");
  console.log("   • Messages are for the client, so they must say what to do — 'must be");
  console.log("     between 12 and 128 characters' — without echoing back secrets or");
  console.log("     revealing whether an email is already registered. That last one is");
  console.log("     an account-enumeration leak dressed as a helpful message.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Chains registered, validationResult never called. Everything is
//   "validated" and nothing is rejected. → §4
//
// Bug 2 — handleValidation copy-pasted into handlers instead of shared, so
//   one route eventually ships without it. → §4
//
// Bug 3 — A sanitizer placed after the validator it was meant to help, so
//   the untrimmed value was the one checked. → §5
//
// Bug 4 — .escape() on input, storing HTML entities that then appear
//   literally in a JSON API, a CSV export or an email. → §5
//
// Bug 5 — Validating only presence, not TYPE, so a query param arrives as
//   an object and becomes a database operator. → §6, 06 §7
//
// Bug 6 — Building an update with Object.assign(user, req.body) after
//   validation passed. Mass assignment. → §7
//
// Bug 7 — Privilege fields living on the same endpoint as profile fields,
//   so one missing allow-list is a privilege escalation. → §7
//
// Bug 8 — Reporting one error at a time, turning a four-field form into
//   four round trips. → §8
//
// Bug 9 — Error messages that reveal whether an account exists. → §8
//
// Bug 10 — Trusting req.params without validating it, then using it in a
//   query or a file path. → 06 §8, 09 §6
//
// Bug 11 — Validating the body while the same route also reads req.query,
//   which nobody declared.
//
// Bug 12 — .optional() on a field the business logic requires, so absence
//   silently skips every check on it.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — chains do not reject:
  assert.equal(results.forgetful.status, 200,
    "a route with chains but no validationResult returned 200 for invalid data 🐛");
  assert.equal(results.forgetful.saved, 1, "…and wrote the row 🐛");
  assert.deepEqual(results.forgetful.row, { email: "not-an-email", age: "-5" },
    "…storing an invalid email and a negative age 🐛");
  assert.equal(results.correct.status, 422,
    "the identical chains plus handleValidation refused the same request ✅");
  assert.equal(results.correct.saved, 0, "…and wrote nothing for the invalid request ✅");
  assert.equal(results.correctSavedValid, 1, "…while a subsequent VALID request did write ✅");
  assert.equal(results.correct.body.details.length, 2, "…reporting both failures");
  assert.equal(results.validAccepted, 200, "…while valid data still passed ✅");

  // § 5 — sanitizers mutate, order matters:
  const s = results.sanitize;
  assert.equal(s.before.email, "  ADA@Example.COM  ", "the raw body arrived untouched…");
  assert.equal(s.after.email, "ada@example.com", "…and the chain rewrote it in place ✅");
  assert.equal(s.after.age, 30, "…coercing age to a number");
  assert.equal(s.ageType, "number", "…so downstream code sees a real number, not '30' ✅");
  assert.equal(s.after.bio, "&lt;script&gt;x&lt;/script&gt;", "…and escaped the HTML");
  assert.equal(s.orderRight, 200, ".trim().isEmail() accepted a padded email ✅");
  assert.equal(s.orderWrong, 422,
    "…while .isEmail().trim() rejected the identical value — the sanitizer ran too late 🐛");

  // § 6 — shape checks:
  assert.equal(results.injection.honestCount, 1, "the honest query matched one user");
  assert.equal(results.injection.injectedCount, 2,
    "…and ?user[$ne]= returned EVERY user through the unvalidated route 🐛");
  assert.equal(results.injection.blockedStatus, 422,
    "…while an isString() check rejected the identical request ✅");
  assert.equal(results.injection.blockedBody.details[0].msg, "user must be a string");
  assert.equal(results.injection.validatedCount, 1, "…and the honest query still worked ✅");
  assert.deepEqual(results.pollutionKeys, ["name"],
    "a body carrying __proto__ and role reached the handler as ONLY the declared field ✅");
  assert.equal(results.prototypeClean, true, "…and Object.prototype was never touched ✅");

  // § 7 — mass assignment:
  assert.deepEqual(results.massAssignment.naive, { role: "admin", credits: 999999, id: 2 },
    "Object.assign(user, req.body) applied role, credits and id — after validation PASSED 🐛");
  assert.deepEqual(results.massAssignment.allowlist, { role: "user", credits: 10, id: 1 },
    "…while matchedData() copied only the declared fields, leaving privileges intact ✅");

  // § 8 — error shape:
  assert.equal(results.errorShape.all.details.length, 4,
    "all four invalid fields were reported in one response ✅");
  assert.deepEqual(results.errorShape.all.details.map((d) => d.path).sort(),
    ["age", "email", "password", "plan"]);
  assert.ok(results.errorShape.all.details.every((d) => d.location === "body"),
    "…each labelled with where the value came from");
  assert.equal(typeof results.errorShape.first.error, "string",
    "…while the fail-fast variant returned only one message 🐛 for form UX");
  assert.equal(results.errorShape.okStatus, 200, "…and a fully valid request passed ✅");

  console.log("§10 — mini assertions passed for: express-validator");
  console.log("\n  The pair that captures it: chains without validationResult saved an");
  console.log("  invalid user and returned 200 — and a body that PASSED validation still");
  console.log("  set role:'admin' through Object.assign.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you validate input in Express?", answer:
//
//   "With express-validator, chains like body('email').trim().isEmail() are
//    ordinary middleware. Each one reads a named field from a specific
//    location — body, query, params, headers — runs its validators and
//    sanitizers in the order written, and records failures on the request.
//    The crucial detail is that a chain always calls next(). It never
//    rejects anything.
//
//    So the bug I look for first is chains registered without
//    validationResult ever being called. The route looks validated in
//    review, the chains genuinely run, and invalid data goes straight to the
//    database with a 200. I've reproduced that: same chains on two routes,
//    one has a handleValidation middleware after them and the other doesn't,
//    and only one of them saves an invalid user. That's why handleValidation
//    is a shared middleware, not an if-statement copy-pasted into handlers —
//    the version you can forget is the version that ships.
//
//    Sanitizers are the other half and they MUTATE req.body, so order
//    matters: .trim().isEmail() accepts a padded address and
//    .isEmail().trim() rejects the same value, because the sanitizer ran
//    after the check. Sanitize, then validate, then coerce. One caution:
//    .escape() on input means you've stored HTML entities, which is wrong
//    everywhere that isn't HTML. Escape on output for the context you're
//    rendering into.
//
//    What I'd emphasise is which attacks this actually closes. A single
//    isString() stops the query-parser type confusion where ?user[$ne]=
//    arrives as an object and becomes a database operator. And building the
//    update from matchedData() rather than req.body closes both prototype
//    pollution and mass assignment — not by blocking __proto__, but by never
//    copying a key nobody declared. That last one matters because a body of
//    { name: 'Ada', role: 'admin', credits: 999999 } PASSES validation
//    perfectly; nothing about it is malformed. Object.assign then makes the
//    user an admin. Validation answers 'is this well-formed', never 'is this
//    user allowed to set this field'.
//
//    On the response: report every failure at once with the field name and a
//    message the user can act on, and pick 400 or 422 deliberately — 400 for
//    a malformed request, 422 for one that parsed and was unacceptable."
//
// Naming the three attacks the schema closes — type confusion, prototype
// pollution, mass assignment — is what makes this a security answer rather
// than a library tour.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does a validation chain reject a bad request?
// A1. No. It records and calls next(). You reject (§4).
//
// Q2. What is the most common bug?
// A2. Never calling validationResult, so nothing is enforced (§4).
//
// Q3. What is the difference between a validator and a sanitizer?
// A3. A validator reports; a sanitizer rewrites the value in req (§5).
//
// Q4. Does chain order matter?
// A4. Yes — steps run in the order written, so a late sanitizer does not
//     help an earlier validator (§5).
//
// Q5. Should you .escape() on input?
// A5. No. Escape on output, for the rendering context. Storing entities
//     corrupts non-HTML consumers (§5).
//
// Q6. How does validation stop NoSQL operator injection?
// A6. By asserting the TYPE — an object never satisfies isString() (§6,
//     06 §7).
//
// Q7. How does it stop prototype pollution?
// A7. Indirectly: build objects from matchedData() so undeclared keys —
//     including __proto__ — are never copied (§6, 13 §8).
//
// Q8. What is mass assignment?
// A8. Copying a whole request body onto a record, so undeclared privileged
//     fields are applied (§7).
//
// Q9. Does passing validation prevent it?
// A9. No — the payload is perfectly well-formed. Only an allow-list does
//     (§7).
//
// Q10. Where should privilege changes live?
// A10. On their own endpoint with their own authorisation, never as a field
//      in a profile update (§7).
//
// Q11. Report one error or all of them?
// A11. All, with field names — one per round trip is why users abandon
//      forms (§8).
//
// Q12. 400 or 422?
// A12. 400 for malformed, 422 for well-formed but unacceptable. Be
//      consistent (§8).
//
// Q13. Where should validation run relative to auth?
// A13. After authentication (so you're not validating for anonymous
//      floods) and before the handler. Cheap header-level rejections —
//      rate limits, CORS — come first (01 §4, 12).
//
// Q14. Schema libraries (zod, joi) versus express-validator?
// A14. Same job; schema-first libraries give you one declaration that
//      doubles as a TypeScript type and returns a parsed object rather
//      than mutating req — which makes the allow-list the default instead
//      of something you remember.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Does a chain reject?
//   Back : No. It records and calls next(). validationResult decides.
//
// Flashcard 2:
//   Front: The classic bug?
//   Back : Chains present, validationResult never called.
//
// Flashcard 3:
//   Front: Validator vs sanitizer?
//   Back : Reports vs MUTATES req.body.
//
// Flashcard 4:
//   Front: .isEmail().trim() vs .trim().isEmail()?
//   Back : The first validates the untrimmed value and fails.
//
// Flashcard 5:
//   Front: Escape on input or output?
//   Back : Output, per rendering context.
//
// Flashcard 6:
//   Front: What kills ?user[$ne]= ?
//   Back : isString(). An object fails a type assertion.
//
// Flashcard 7:
//   Front: Mass assignment defence?
//   Back : matchedData() — an allow-list, never req.body.
//
// Flashcard 8:
//   Front: Does valid data mean safe data?
//   Back : No. { name, role:'admin' } is perfectly valid.
//
// Flashcard 9:
//   Front: 400 vs 422?
//   Back : Malformed vs well-formed-but-unacceptable.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "Validation answers 'is this well-formed', never 'is this user
//          allowed to set this field'."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write a route factory that makes handleValidation impossible to forget:
//   it takes chains and a handler and wires the rejection in between.
//
// Task 2:
//   Add .custom() with an async check (an email uniqueness lookup) and
//   handle the rejection correctly — remember 02 §8.
//
// Task 3:
//   Add a strict mode that 422s when req.body contains any key no chain
//   declared. Would you ship it? What breaks?
//
// Task 4:
//   Reproduce §7's escalation against a real ORM-shaped update, then fix it
//   twice — once with matchedData and once with the ORM's allow-list — and
//   argue for keeping both.
//
// Task 5:
//   Validate req.params with param('id').isInt().toInt() and prove the
//   handler receives a number, closing 06 §5's string problem.
//
// Task 6:
//   Build the same schema in zod and compare: how many places can you
//   forget to enforce it in each approach?
//
// Task 7:
//   Add a field-level error format matching your front end's expectations
//   ({ fieldName: message }) and write the test that locks the shape.
//
// Task 8:
//   Measure the cost: 12 chains on a hot endpoint, 10,000 requests. Is
//   validation ever the bottleneck, and what does that tell you about
//   validating everything?


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Chains record failures and call next(). Nothing is rejected until you
//   read validationResult — which is why chains can be present and enforce
//   nothing.
//
// If you remember the common bug:
//   Object.assign(user, req.body) after validation passed. The payload was
//   valid; it also contained role: 'admin'.
//
// If you remember the professional framing:
//   Sanitize then validate then coerce, a shared handleValidation you cannot
//   forget, matchedData() as the only input to writes, every error reported
//   at once, and privilege changes on their own authorised endpoint.
//
// ─────────────────────────────────────────────────────────────────
// Seventeen files in, the request is authenticated, limited, parsed,
// validated and answered. The one thing still missing is the ability to see
// any of it happen — which is the last topic in this group.
//
// NEXT TOPIC -> 18_morgan-logger.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
