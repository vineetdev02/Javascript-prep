// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  12_rate-limiting-express-rate-limit.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Rate limiting (express-rate-limit)
//
// WHAT YOU WILL MASTER HERE:
//   1. A working limiter over real HTTP: 5 allowed, the 6th refused with 429,
//      RateLimit-* headers and Retry-After
//   2. The fixed-window flaw, executed on a controllable clock: TWICE the
//      configured limit delivered in a two-second span, entirely legally
//   3. Three algorithms compared on the identical traffic — fixed window,
//      sliding log, token bucket — with the burst each one permits
//   4. The key function, which is where the real bugs are: behind a proxy
//      every request shares one IP, and blindly trusting X-Forwarded-For
//      lets an attacker mint unlimited identities
//   5. Why an in-memory store multiplies your limit by the number of
//      processes, measured across four simulated instances
//   6. Why per-IP limiting does not stop credential stuffing, shown with a
//      distributed attack that never trips a single counter
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/12_rate-limiting-express-rate-limit.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js §6 (a middleware that
// ends the response short-circuits the walk — that is exactly what a limiter
// is) and 07_request-lifecycle.js §4 (header-only work is cheap, which is
// why a limiter belongs near the top).
//
// This is the first middleware in the group that has to keep STATE between
// requests, and every hard part of it follows from that one fact.


const http = require("http");

const results = {};

// A controllable clock. Every algorithm below takes now() as an input, so
// the timing proofs are deterministic instead of relying on sleeps.
const clock = { t: 1_000_000 };
const now = () => clock.t;
const advance = (ms) => { clock.t += ms; };


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Rate limiting:
// a middleware that derives a KEY from each request (usually the client's
// IP, sometimes a user or API key), counts requests per key inside a time
// window held in a STORE, and short-circuits with 429 Too Many Requests once
// the count exceeds a configured maximum.
//
// If interviewer says "explain it simply", say:
//   "Three decisions and they're all independent: what identifies a client —
//    the key; how you count over time — the algorithm; and where the counter
//    lives — the store. express-rate-limit gives you defaults for all three,
//    and all three defaults are wrong for a real deployment: the key is the
//    socket IP, which is your load balancer's; the algorithm is a fixed
//    window, which lets through double the limit at a boundary; and the
//    store is process memory, which multiplies your limit by however many
//    processes you run."
//
// If interviewer says "what's it protecting against?", say:
//   "Different things depending on where you put it, and that's the point.
//    A global limiter is about capacity — one client can't monopolise the
//    server. A tight limiter on /login is about credential stuffing. A
//    limiter on a password-reset or SMS endpoint is about cost. They need
//    different keys and different numbers, so one global limiter is rarely
//    the whole answer."
//
// Why it matters in interviews:
//   Everyone can add app.use(rateLimit()). The senior signal is knowing that
//   the key function is where the bugs are, that the store decides whether
//   the limit means anything in a cluster, and that per-IP limiting does
//   very little against a distributed attack.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   KEY · ALGORITHM · STORE. GET ANY ONE WRONG AND THE LIMIT IS FICTION.
//
// Runtime rule:
//   On each request: key = keyGenerator(req) → store.increment(key) →
//   over the max? set Retry-After and end with 429 : set RateLimit-* headers
//   and next(). It is an ordinary short-circuiting middleware (01 §6).
//
// Practical rule:
//   Trust the proxy explicitly and only one hop. Key on the authenticated
//   user where one exists and the IP otherwise. Use a shared store the moment
//   you run more than one process. Exempt health checks; limit auth
//   endpoints far harder than everything else.
//
// Common trap:
//   `keyGenerator: (req) => req.headers['x-forwarded-for']` with no trust
//   configuration. The header is client-supplied, so an attacker sends a
//   different value per request and every request gets a fresh counter.
//
// The mental picture:
//
//   request ──▶ keyGenerator(req)      "203.0.113.9"  or  "user:42"
//                     │
//                     ▼
//               store.hit(key)   ── in-memory Map (one process)
//                     │          └─ Redis (all processes)  ← the real one
//                     ▼
//        count > max ? ──yes──▶ 429 + Retry-After     (walk STOPS, 01 §6)
//                     └──no───▶ RateLimit-* headers → next()


// ══════════════════════════════════════════════════════════════════
// § 3 — THREE ALGORITHMS, ONE INTERFACE
// ══════════════════════════════════════════════════════════════════

// (a) FIXED WINDOW — what express-rate-limit does by default.
//     One counter per key per window. Cheap: two numbers per key.
function fixedWindow({ windowMs, max }) {
  const state = new Map();
  return {
    name: "fixed window",
    hit(key) {
      const t = now();
      // Windows are aligned to the clock — every key's counter resets at the
      // same instant. That is what makes the boundary burst in §5 possible,
      // and it is how most fixed-window limiters (and every quota that is
      // stated "per minute") actually behave.
      const windowStart = Math.floor(t / windowMs) * windowMs;
      let s = state.get(key);
      if (!s || s.windowStart !== windowStart) {
        s = { count: 0, windowStart, resetAt: windowStart + windowMs };
        state.set(key, s);
      }
      s.count++;
      return {
        allowed: s.count <= max,
        used: s.count,
        remaining: Math.max(0, max - s.count),
        resetAt: s.resetAt,
        retryAfterMs: s.resetAt - t,
      };
    },
    size: () => state.size,
  };
}

// (b) SLIDING LOG — remember every timestamp, drop the ones that aged out.
//     Exact, and the memory cost is one timestamp per request in the window.
function slidingLog({ windowMs, max }) {
  const state = new Map();
  return {
    name: "sliding log",
    hit(key) {
      const t = now();
      const log = (state.get(key) || []).filter((ts) => ts > t - windowMs);
      log.push(t);
      state.set(key, log);
      return {
        allowed: log.length <= max,
        used: log.length,
        remaining: Math.max(0, max - log.length),
        resetAt: log[0] + windowMs,
        retryAfterMs: Math.max(0, log[0] + windowMs - t),
      };
    },
    size: () => state.size,
  };
}

// (c) TOKEN BUCKET — a steady refill rate plus a burst allowance.
//     What you want for an API: sustained rate AND a tolerable spike.
function tokenBucket({ capacity, refillPerMs }) {
  const state = new Map();
  return {
    name: "token bucket",
    hit(key) {
      const t = now();
      let s = state.get(key);
      if (!s) { s = { tokens: capacity, last: t }; state.set(key, s); }
      s.tokens = Math.min(capacity, s.tokens + (t - s.last) * refillPerMs);
      s.last = t;
      const allowed = s.tokens >= 1;
      if (allowed) s.tokens -= 1;
      return {
        allowed,
        used: capacity - Math.floor(s.tokens),
        remaining: Math.floor(s.tokens),
        resetAt: t + Math.ceil((1 - s.tokens) / refillPerMs),
        retryAfterMs: allowed ? 0 : Math.ceil((1 - s.tokens) / refillPerMs),
      };
    },
    size: () => state.size,
  };
}

// The middleware around any of them.
function rateLimit({ limiter, max, keyGenerator, skip }) {
  return function rateLimitMiddleware(req, res, next) {
    if (skip && skip(req)) return next();
    const key = keyGenerator(req);
    const r = limiter.hit(key);

    res.setHeader("ratelimit-limit", String(max));
    res.setHeader("ratelimit-remaining", String(r.remaining));
    res.setHeader("ratelimit-reset", String(Math.ceil(r.retryAfterMs / 1000)));

    if (!r.allowed) {
      res.setHeader("retry-after", String(Math.ceil(r.retryAfterMs / 1000)));
      res.statusCode = 429;
      return res.end("Too Many Requests");         // short-circuit (01 §6)
    }
    next();
  };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    get(path, fn) { stack.push({ path, fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
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
// § 4 — A LIMITER OVER REAL HTTP
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — five through, the sixth refused ══\n");

  let handlerRuns = 0;
  const limiter = fixedWindow({ windowMs: 60_000, max: 5 });

  const app = miniExpress();
  app.use(rateLimit({
    limiter, max: 5,
    keyGenerator: (req) => req.socket.remoteAddress,
    skip: (req) => req.url === "/health",                     // §8
  }));
  app.get("/api", (req, res) => { handlerRuns++; res.end("ok"); });
  app.get("/health", (req, res) => { handlerRuns++; res.end("alive"); });

  const { server, port } = await app.listen();

  const rows = [];
  for (let n = 1; n <= 7; n++) {
    const r = await request(port, "/api");
    rows.push({
      n, status: r.status,
      remaining: r.headers["ratelimit-remaining"],
      retryAfter: r.headers["retry-after"] ?? "—",
    });
  }
  const health = [];
  for (let n = 0; n < 3; n++) health.push((await request(port, "/health")).status);
  server.close();

  results.limitRows = rows;
  results.handlerRunsUnderLimit = handlerRuns;
  results.healthStatuses = health;

  console.log("  #   status   ratelimit-remaining   retry-after");
  console.log("  ─────────────────────────────────────────────");
  for (const r of rows) {
    console.log("  " + String(r.n).padEnd(4) + String(r.status).padEnd(9) +
                String(r.remaining).padEnd(22) + r.retryAfter);
  }
  console.log("\n  route handler executions across those 7 requests + 3 health checks:",
              handlerRuns);
  console.log("  health check statuses (skipped by the limiter):", health.join(", "));
  console.log("\n  Requests 6 and 7 never reached the handler — the limiter ended the");
  console.log("  response itself, which is the short-circuit from 01 §6. That is the");
  console.log("  whole value: the expensive work below never happens.");
  console.log("\n  Note the headers. RateLimit-Remaining lets a well-behaved client");
  console.log("  slow down BEFORE being refused, and Retry-After tells a refused one");
  console.log("  exactly how long to wait. A limiter that returns a bare 429 with no");
  console.log("  headers turns polite clients into retry storms.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FIXED-WINDOW BOUNDARY BURST
// ══════════════════════════════════════════════════════════════════
//
// The flaw in the default algorithm, executed on the controllable clock:
// "5 per minute" delivers 10 requests inside two seconds.

function section5() {
  console.log("\n══ § 5 — 'five per minute' delivering ten in two seconds ══\n");

  const WINDOW = 60_000, MAX = 5;
  const fixed = fixedWindow({ windowMs: WINDOW, max: MAX });
  const sliding = slidingLog({ windowMs: WINDOW, max: MAX });

  // Park the clock just under a window boundary (1_200_000 is exactly 20
  // windows of 60s), so the burst straddles the reset instant.
  clock.t = 1_200_000 - 1000;
  const timeline = [];

  // last ~0.75s of window N — five requests, all legal.
  for (let i = 0; i < 5; i++) {
    advance(150);
    timeline.push({ t: clock.t, fixed: fixed.hit("ip").allowed, sliding: sliding.hit("ip").allowed });
  }
  advance(500);                       // cross the boundary into window N+1
  // first ~0.75s of window N+1 — five more, also legal for a fixed window
  for (let i = 0; i < 5; i++) {
    advance(150);
    timeline.push({ t: clock.t, fixed: fixed.hit("ip").allowed, sliding: sliding.hit("ip").allowed });
  }

  const start = timeline[5].t;
  const burstWindow = timeline[timeline.length - 1].t - timeline[0].t;
  const fixedAllowed = timeline.filter((x) => x.fixed).length;
  const slidingAllowed = timeline.filter((x) => x.sliding).length;

  results.boundaryBurst = { fixedAllowed, slidingAllowed, max: MAX, burstWindow, start };

  console.log("  configured limit: " + MAX + " requests per " + WINDOW / 1000 + "s\n");
  console.log("  requests allowed by FIXED WINDOW :", fixedAllowed, " 🐛 that is " +
              (fixedAllowed / MAX) + "× the limit");
  console.log("  requests allowed by SLIDING LOG  :", slidingAllowed, " ✅ exactly the limit");
  console.log("  elapsed across the whole burst   :", burstWindow / 1000 + "s");
  console.log("\n  Nothing here is an attack. Five requests at the end of one window and");
  console.log("  five at the start of the next are individually legal — the fixed-window");
  console.log("  counter simply reset in the middle. Any client that happens to align");
  console.log("  with the boundary, deliberately or not, gets double.");
  console.log("\n  So the honest way to size a fixed window is: assume a client can");
  console.log("  deliver 2× max in a short burst, and pick max so that 2× is still");
  console.log("  survivable. If it isn't, you need a sliding window or a token bucket");
  console.log("  — which is what the next section compares.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE SAME TRAFFIC THROUGH ALL THREE
// ══════════════════════════════════════════════════════════════════

function section6() {
  console.log("\n══ § 6 — fixed window vs sliding log vs token bucket ══\n");

  // Traffic: a 10-request burst, then a steady 1 request/second for 10s.
  function run(limiter) {
    clock.t = 2_000_000;
    let burstAllowed = 0, steadyAllowed = 0;
    for (let i = 0; i < 10; i++) { advance(50); if (limiter.hit("ip").allowed) burstAllowed++; }
    for (let i = 0; i < 10; i++) { advance(1000); if (limiter.hit("ip").allowed) steadyAllowed++; }
    return { burstAllowed, steadyAllowed };
  }

  const table = {
    "fixed window (5 / 10s)": run(fixedWindow({ windowMs: 10_000, max: 5 })),
    "sliding log (5 / 10s)": run(slidingLog({ windowMs: 10_000, max: 5 })),
    "token bucket (cap 5, +1/2s)": run(tokenBucket({ capacity: 5, refillPerMs: 1 / 2000 })),
  };
  results.algorithmTable = table;

  console.log("  traffic: 10 requests in 500ms, then 1 request/second for 10s\n");
  console.log("  algorithm                       burst allowed   steady allowed");
  console.log("  ───────────────────────────────────────────────────────────────");
  for (const [k, v] of Object.entries(table)) {
    console.log("  " + k.padEnd(32) + String(v.burstAllowed).padEnd(16) + v.steadyAllowed);
  }
  console.log("\n  Read the two columns as two different questions:");
  console.log("   • Fixed window is cheap — two numbers per key — and imprecise at the");
  console.log("     boundary (§5). Good enough for coarse abuse protection.");
  console.log("   • Sliding log is exact, and costs one stored timestamp per request in");
  console.log("     the window. At scale that memory is the reason people don't use it.");
  console.log("   • Token bucket refuses the tail of a burst but keeps admitting the");
  console.log("     steady traffic as tokens refill — which is what an API client");
  console.log("     actually wants: a spike is tolerated, a sustained flood is not.");
  console.log("\n  There is no 'best'. There is 'what should a well-behaved client be");
  console.log("  able to do', and the algorithm is chosen to allow exactly that.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE KEY FUNCTION IS WHERE THE BUGS LIVE
// ══════════════════════════════════════════════════════════════════

async function section7() {
  console.log("\n══ § 7 — behind a proxy, and the spoofable header ══\n");

  // (a) Socket IP behind a proxy: every user looks like one client.
  const socketKeyed = miniExpress();
  const l1 = fixedWindow({ windowMs: 60_000, max: 5 });
  socketKeyed.use(rateLimit({ limiter: l1, max: 5, keyGenerator: (req) => req.socket.remoteAddress }));
  socketKeyed.get("/api", (req, res) => res.end("ok"));

  // (b) Blindly trusting X-Forwarded-For: the attacker mints new identities.
  const blindTrust = miniExpress();
  const l2 = fixedWindow({ windowMs: 60_000, max: 5 });
  blindTrust.use(rateLimit({
    limiter: l2, max: 5,
    keyGenerator: (req) => req.headers["x-forwarded-for"] || req.socket.remoteAddress,
  }));
  blindTrust.get("/api", (req, res) => res.end("ok"));

  // (c) Correct: trust exactly one hop, take the RIGHTMOST entry the proxy
  //     appended — the leftmost entries are attacker-controlled.
  const trustOne = miniExpress();
  const l3 = fixedWindow({ windowMs: 60_000, max: 5 });
  trustOne.use(rateLimit({
    limiter: l3, max: 5,
    keyGenerator: (req) => {
      const xff = (req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
      return xff.length ? xff[xff.length - 1] : req.socket.remoteAddress;
    },
  }));
  trustOne.get("/api", (req, res) => res.end("ok"));

  const a = await socketKeyed.listen();
  const b = await blindTrust.listen();
  const c = await trustOne.listen();

  clock.t = 3_000_000;

  // (a) ten DIFFERENT users arriving through one proxy — same socket IP.
  const perUser = [];
  for (let user = 1; user <= 10; user++) {
    const r = await request(a.port, "/api", { "x-forwarded-for": "203.0.113." + user });
    perUser.push(r.status);
  }

  // (b) ONE attacker, ten forged headers.
  const attacker = [];
  for (let n = 1; n <= 10; n++) {
    const r = await request(b.port, "/api", { "x-forwarded-for": "10.0.0." + n });
    attacker.push(r.status);
  }

  // (c) the same attacker against the corrected key: the proxy appends the
  //     real client address, and only that last entry is used.
  const attackerVsCorrect = [];
  for (let n = 1; n <= 10; n++) {
    const r = await request(c.port, "/api", { "x-forwarded-for": "10.0.0." + n + ", 198.51.100.7" });
    attackerVsCorrect.push(r.status);
  }

  a.server.close(); b.server.close(); c.server.close();

  results.proxyPerUser = { statuses: perUser, refused: perUser.filter((s) => s === 429).length };
  results.spoofed = { statuses: attacker, refused: attacker.filter((s) => s === 429).length };
  results.corrected = { statuses: attackerVsCorrect, refused: attackerVsCorrect.filter((s) => s === 429).length };

  console.log("  (a) keyed on socket IP, 10 DIFFERENT users behind one proxy");
  console.log("      statuses:", perUser.join(" "));
  console.log("      refused :", results.proxyPerUser.refused, "of 10 🐛 five innocent users locked out");
  console.log("\n  (b) keyed on raw X-Forwarded-For, ONE attacker forging 10 values");
  console.log("      statuses:", attacker.join(" "));
  console.log("      refused :", results.spoofed.refused, "of 10 🐛 the limit does not exist");
  console.log("\n  (c) keyed on the LAST X-Forwarded-For entry (the one your proxy wrote)");
  console.log("      statuses:", attackerVsCorrect.join(" "));
  console.log("      refused :", results.corrected.refused, "of 10 ✅");
  console.log("\n  Both failures are total, and they are opposite. Trusting the socket");
  console.log("  makes every user behind a NAT or a load balancer share one budget —");
  console.log("  your limiter becomes an outage for a whole office. Trusting the header");
  console.log("  makes the budget per-header-value, and the header is written by the");
  console.log("  client — so the attacker gets a new budget every request.");
  console.log("\n  The rule: decide HOW MANY proxies are in front of you and trust");
  console.log("  exactly that many hops. In Express that is app.set('trust proxy', 1),");
  console.log("  which makes req.ip the entry your own proxy appended. 'trust proxy':");
  console.log("  true — trust everything — recreates failure (b).");
  console.log("\n  And where a user is authenticated, key on the USER id instead. It is");
  console.log("  stable across their phone and laptop, unaffected by NAT, and cannot be");
  console.log("  forged without stealing the session.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE STORE: WHY YOUR LIMIT IS SILENTLY MULTIPLIED
// ══════════════════════════════════════════════════════════════════

function section8() {
  console.log("\n══ § 8 — one limit per process is not one limit ══\n");

  const INSTANCES = 4, MAX = 5;
  clock.t = 4_000_000;

  // (a) the default: each process has its own Map.
  const perProcess = Array.from({ length: INSTANCES }, () => fixedWindow({ windowMs: 60_000, max: MAX }));
  let allowedPerProcess = 0;
  for (let n = 0; n < 40; n++) {
    const instance = perProcess[n % INSTANCES];          // load balancer round-robin
    if (instance.hit("ip").allowed) allowedPerProcess++;
  }

  // (b) a shared store — one counter, every process talking to it.
  const shared = fixedWindow({ windowMs: 60_000, max: MAX });
  const sharedInstances = Array.from({ length: INSTANCES }, () => shared);
  let allowedShared = 0;
  for (let n = 0; n < 40; n++) {
    if (sharedInstances[n % INSTANCES].hit("ip").allowed) allowedShared++;
  }

  results.storeComparison = { instances: INSTANCES, max: MAX, allowedPerProcess, allowedShared };

  console.log("  limit: " + MAX + " per window · instances: " + INSTANCES + " · client sends 40 requests\n");
  console.log("    in-memory store (default)  allowed:", allowedPerProcess,
              " 🐛 = " + MAX + " × " + INSTANCES + " instances");
  console.log("    shared store (Redis)       allowed:", allowedShared, " ✅ = the configured limit");
  console.log("\n  The in-memory store is not wrong, it is just LOCAL. Four processes,");
  console.log("  four counters, four times the limit — and the number changes every");
  console.log("  time you scale, which is the worst property a security control can");
  console.log("  have: it silently loosens under load.");
  console.log("\n  Three consequences people meet in production:");
  console.log("   • A restart or a deploy empties the store, so every counter resets.");
  console.log("     For abuse protection that is tolerable; for a login limiter it is a");
  console.log("     free reset for an attacker who can trigger a rolling restart.");
  console.log("   • With a shared store, the store is now on the request path. If Redis");
  console.log("     is down, do you fail open (serve everyone, no limit) or fail closed");
  console.log("     (429 everyone)? Decide that deliberately — the default in most");
  console.log("     libraries is fail open, which is usually right and is still a");
  console.log("     decision, not an accident.");
  console.log("   • Sticky sessions do NOT fix it. They reduce the multiplier for a");
  console.log("     given client, but any rebalance moves them to a fresh counter.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT PER-IP LIMITING DOES NOT SOLVE
// ══════════════════════════════════════════════════════════════════

function section9() {
  console.log("\n══ § 9 — credential stuffing walks straight through ══\n");

  clock.t = 5_000_000;
  const perIp = fixedWindow({ windowMs: 900_000, max: 5 });      // 5 logins / 15 min per IP
  const perAccount = fixedWindow({ windowMs: 900_000, max: 5 }); // …and per account

  // The naive attack: one IP, one account, many guesses. Caught.
  let naiveAllowed = 0;
  for (let i = 0; i < 20; i++) if (perIp.hit("198.51.100.1").allowed) naiveAllowed++;

  // The real attack: a botnet. 200 addresses, ONE guess each, all against
  // the same account — the password everyone reuses.
  clock.t += 1000;
  let distributedAllowedIp = 0, distributedAllowedAccount = 0;
  for (let bot = 0; bot < 200; bot++) {
    if (perIp.hit("192.0.2." + bot).allowed) distributedAllowedIp++;
    if (perAccount.hit("account:victim@example.com").allowed) distributedAllowedAccount++;
  }

  results.stuffing = {
    naiveAllowed,
    distributedAllowedIp,
    distributedAllowedAccount,
    botCount: 200,
  };

  console.log("  limiter: 5 login attempts / 15 min\n");
  console.log("  naive attack — 20 guesses from 1 IP");
  console.log("    allowed by the per-IP limiter :", naiveAllowed, " ✅ caught after 5");
  console.log("\n  real attack — 200 bots, 1 guess each, same victim account");
  console.log("    allowed by the per-IP limiter      :", distributedAllowedIp,
              "of 200 🐛 not one was refused");
  console.log("    allowed by a per-ACCOUNT limiter   :", distributedAllowedAccount,
              "of 200 ✅");
  console.log("\n  Each bot made exactly one request, so no IP counter ever reached its");
  console.log("  limit. The per-IP limiter is not broken — it is answering a different");
  console.log("  question. The attack is not 'one client is too busy', it is 'one");
  console.log("  ACCOUNT is under attack', so the key has to be the account.");
  console.log("\n  A real login endpoint therefore needs at least three limiters at once:");
  console.log("     per IP        — stops one machine grinding");
  console.log("     per account   — stops a botnet grinding one victim");
  console.log("     global        — stops a botnet grinding the whole user table");
  console.log("  …plus exponential backoff and, past a threshold, a CAPTCHA or a lock");
  console.log("  with an out-of-band unlock. Rate limiting alone never stops a");
  console.log("  determined attacker; it makes the attack slow enough to detect.");
  console.log("\n  One caution on per-account limiting: it is a denial-of-service vector");
  console.log("  by design — anyone can lock a victim out by failing their login five");
  console.log("  times. That is why real systems throttle rather than lock, and weight");
  console.log("  the counter by whether the attempt came from a known device.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A whole office locked out because the limiter keyed on the socket
//   IP and everyone shares one NAT or one load balancer. → §7
//
// Bug 2 — The limit rendered meaningless by keying on a raw, client-supplied
//   X-Forwarded-For. → §7
//
// Bug 3 — 'trust proxy': true in a public deployment — the same as Bug 2,
//   arrived at through a configuration flag. → §7
//
// Bug 4 — The limit quietly multiplied by the number of processes, and
//   changing every time you scale. → §8
//
// Bug 5 — Redis outage taking the whole API down because the limiter failed
//   closed and nobody decided that on purpose. → §8
//
// Bug 6 — Double the configured rate delivered at a window boundary, then
//   diagnosed as "the limiter doesn't work". → §5
//
// Bug 7 — A global limiter counting static assets and health checks, so a
//   single page load with 40 assets exhausts a 30-request budget. → §4
//
// Bug 8 — 429 returned with no Retry-After, so well-behaved clients retry
//   immediately and turn a limit into a stampede. → §4
//
// Bug 9 — The limiter registered BELOW the expensive routes, so the work it
//   was meant to prevent has already happened. → 01 §4
//
// Bug 10 — Per-IP login limiting treated as anti-credential-stuffing, while
//   a 200-bot attack never trips a counter. → §9
//
// Bug 11 — Per-account limiting shipped without thinking about the lockout
//   DoS it creates. → §9


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 11 — assertions ══\n");

  // § 4 — the basic limiter:
  const statuses = results.limitRows.map((r) => r.status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429],
    "five requests passed and the sixth and seventh were refused with 429 ✅");
  assert.equal(results.limitRows[4].remaining, "0", "…RateLimit-Remaining reached 0 on the last allowed request");
  assert.notEqual(results.limitRows[5].retryAfter, "—", "…and the 429 carried a Retry-After ✅");
  assert.equal(results.handlerRunsUnderLimit, 8,
    "the handler ran 5 times for /api plus 3 health checks — the refused requests never reached it ✅");
  assert.deepEqual(results.healthStatuses, [200, 200, 200],
    "…and the skip() function exempted the health check entirely ✅");

  // § 5 — the boundary burst:
  assert.equal(results.boundaryBurst.fixedAllowed, 10,
    "a fixed window configured for 5 allowed 10 requests across the boundary 🐛");
  assert.equal(results.boundaryBurst.fixedAllowed, results.boundaryBurst.max * 2,
    "…exactly twice the configured limit, which is the worst case for fixed windows");
  assert.equal(results.boundaryBurst.slidingAllowed, 5,
    "…while a sliding log over the identical traffic allowed exactly 5 ✅");
  assert.ok(results.boundaryBurst.burstWindow <= 3_000,
    "…and the whole burst took under 3 seconds, against a 60-second limit 🐛 (" +
    results.boundaryBurst.burstWindow + "ms)");

  // § 6 — algorithm comparison:
  const t = results.algorithmTable;
  assert.equal(t["fixed window (5 / 10s)"].burstAllowed, 5, "every algorithm capped the initial burst at 5");
  assert.equal(t["sliding log (5 / 10s)"].burstAllowed, 5);
  assert.equal(t["token bucket (cap 5, +1/2s)"].burstAllowed, 5);
  assert.ok(t["token bucket (cap 5, +1/2s)"].steadyAllowed >= 5,
    "…but the token bucket kept admitting steady traffic as tokens refilled ✅ (" +
    t["token bucket (cap 5, +1/2s)"].steadyAllowed + " of 10)");
  assert.ok(t["sliding log (5 / 10s)"].steadyAllowed < t["token bucket (cap 5, +1/2s)"].steadyAllowed,
    "…more than the exact sliding log allowed over the same period");

  // § 7 — the key function:
  assert.equal(results.proxyPerUser.refused, 5,
    "keyed on the socket IP, 5 of 10 DIFFERENT users behind one proxy were refused 🐛");
  assert.equal(results.spoofed.refused, 0,
    "keyed on a raw X-Forwarded-For, one attacker forging headers was never refused 🐛");
  assert.equal(results.corrected.refused, 5,
    "…and keying on the LAST XFF entry — the one the proxy wrote — refused the same attacker after 5 ✅");

  // § 8 — the store:
  assert.equal(results.storeComparison.allowedPerProcess, 20,
    "an in-memory store across 4 instances allowed 4× the configured limit 🐛");
  assert.equal(results.storeComparison.allowedPerProcess,
    results.storeComparison.max * results.storeComparison.instances,
    "…exactly max × instances, so the limit changes every time you scale 🐛");
  assert.equal(results.storeComparison.allowedShared, 5,
    "…while a shared store enforced the configured limit regardless of instance count ✅");

  // § 9 — credential stuffing:
  assert.equal(results.stuffing.naiveAllowed, 5,
    "a per-IP limiter caught the naive single-source attack after 5 attempts ✅");
  assert.equal(results.stuffing.distributedAllowedIp, 200,
    "…and refused NOTHING when 200 bots made one attempt each 🐛");
  assert.equal(results.stuffing.distributedAllowedAccount, 5,
    "…while a per-ACCOUNT limiter stopped the identical attack after 5 ✅");

  console.log("§11 — mini assertions passed for: Rate limiting (express-rate-limit)");
  console.log("\n  The pair that captures it: a limiter configured for 5 allowed 10 at a");
  console.log("  window boundary and 20 across four processes — and 200 bots making one");
  console.log("  login attempt each were refused zero times by a per-IP limit.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you rate limit an Express API?", answer:
//
//   "Mechanically it's a middleware near the top of the stack that derives a
//    key from the request, counts against that key, and short-circuits with
//    429 plus Retry-After — so the expensive work below never runs. But the
//    interesting part is that it's three independent decisions: the key, the
//    algorithm, and the store. express-rate-limit gives you a default for
//    each and all three defaults are wrong in production.
//
//    The key is where the real bugs are. Keyed on the socket address, every
//    user behind a NAT or a load balancer shares one budget — I've measured
//    that: ten different users through one proxy, five of them refused. The
//    reflex fix is to key on X-Forwarded-For, and that's worse, because the
//    header is written by the client — one attacker forging a different
//    value per request is never refused at all. The correct version is to
//    decide how many proxies you actually have and trust exactly that many
//    hops, so you use the entry your own proxy appended. In Express that's
//    app.set('trust proxy', 1); 'trust proxy': true recreates the spoofing
//    bug. And where the user is authenticated I key on the user id, which
//    can't be forged without stealing the session.
//
//    The algorithm matters less but you should know the flaw: a fixed window
//    lets through double the limit at a boundary — five at the end of one
//    minute and five at the start of the next is ten in two seconds, all of
//    it legal. So either size the limit assuming 2×, or use a sliding window
//    or a token bucket. I like token buckets for APIs because they express
//    what you actually mean: tolerate a spike, refuse a sustained flood.
//
//    The store decides whether the limit means anything. In-memory is
//    per-process, so four instances is four times the limit, and the number
//    changes when you scale — a control that silently loosens under load.
//    Redis fixes it and puts the store on the request path, so you have to
//    decide fail-open versus fail-closed on purpose.
//
//    Last thing, and it's the one I'd raise unprompted: per-IP limiting does
//    almost nothing against credential stuffing. Two hundred bots making one
//    attempt each against the same account trip no counter at all. Login
//    needs a per-account limiter and a global one as well — with the caveat
//    that per-account throttling is itself a denial-of-service vector, which
//    is why you throttle rather than lock."
//
// The three-decisions framing plus the XFF spoofing demo is what separates
// this from "I add express-rate-limit".


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What are the three independent decisions?
// A1. Key, algorithm, store (§2).
//
// Q2. Why is req.socket.remoteAddress a bad key in production?
// A2. Behind a proxy it is the proxy's address — everyone shares a budget
//     (§7).
//
// Q3. Why is raw X-Forwarded-For worse?
// A3. It is client-supplied, so an attacker gets a fresh counter per request
//     (§7).
//
// Q4. What does 'trust proxy' actually do?
// A4. Tells Express how many hops to skip when computing req.ip. Set it to
//     the real number, never to true on a public deployment (§7).
//
// Q5. What is the fixed-window boundary problem?
// A5. Two adjacent windows allow 2× max in a short span (§5).
//
// Q6. Sliding log vs token bucket?
// A6. Exact but stores a timestamp per request, versus a burst allowance
//     plus a refill rate that matches how clients actually behave (§6).
//
// Q7. Why does an in-memory store break in a cluster?
// A7. Each process counts separately: effective limit = max × instances
//     (§8).
//
// Q8. Redis is down — what should happen?
// A8. A decision you make explicitly. Fail open is usual; fail closed turns
//     a cache outage into a total outage (§8).
//
// Q9. Which headers should a limiter set?
// A9. RateLimit-Limit / -Remaining / -Reset always, and Retry-After on the
//     429, so clients can back off instead of retrying instantly (§4).
//
// Q10. Where in the stack does it go?
// A10. Above the routes it protects, below nothing expensive. Skip health
//      checks and static assets (§4, 01 §4).
//
// Q11. Does per-IP limiting stop credential stuffing?
// A11. No. A distributed attack trips nothing. You need a per-account key
//      as well (§9).
//
// Q12. What is the risk of per-account limiting?
// A12. Anyone can lock out a victim. Throttle rather than lock (§9).
//
// Q13. Should a 429 be cached?
// A13. No — set Cache-Control: no-store on it, or a CDN can serve the
//      refusal to everyone.
//
// Q14. Rate limiting vs DDoS protection?
// A14. Different layers. Application-level limiting still requires the
//      request to reach your process; volumetric attacks are absorbed
//      upstream at the CDN or network edge.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The three decisions?
//   Back : Key, algorithm, store.
//
// Flashcard 2:
//   Front: Socket IP as key, behind a proxy?
//   Back : Every user shares one budget.
//
// Flashcard 3:
//   Front: Raw X-Forwarded-For as key?
//   Back : Client-controlled — unlimited free identities.
//
// Flashcard 4:
//   Front: The correct proxy setting?
//   Back : trust proxy = the actual number of hops, never true.
//
// Flashcard 5:
//   Front: Fixed-window worst case?
//   Back : 2× the limit at a boundary.
//
// Flashcard 6:
//   Front: In-memory store in a cluster?
//   Back : Effective limit = max × instances.
//
// Flashcard 7:
//   Front: Headers on a 429?
//   Back : Retry-After, plus RateLimit-* on every response.
//
// Flashcard 8:
//   Front: Does per-IP stop credential stuffing?
//   Back : No. 200 bots × 1 attempt trips nothing. Key on the account too.
//
// Flashcard 9:
//   Front: Risk of per-account limits?
//   Back : Lockout DoS. Throttle, don't lock.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "The key function is where the bugs are — one is an outage for a
//          whole office, the other means the limit doesn't exist."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Implement a sliding WINDOW COUNTER (two adjacent fixed windows,
//   weighted) and compare its boundary behaviour to §5's log and fixed
//   window. Why is this the algorithm most production limiters actually use?
//
// Task 2:
//   Add a Redis-shaped async store interface to rateLimit() and handle the
//   failure case both ways. Which did you pick, and what does your runbook
//   say?
//
// Task 3:
//   Build the three-limiter login stack from §9 (IP, account, global) and
//   prove each one catches an attack the other two miss.
//
// Task 4:
//   Add exponential backoff: each refusal doubles the wait for that key.
//   Prove the attacker's throughput collapses while a legitimate user who
//   mistyped once is barely affected.
//
// Task 5:
//   Instrument §4's app to count how much CPU the refused requests would
//   have cost had the limiter been registered below the route instead.
//
// Task 6:
//   Implement a cost-based limiter: a search endpoint costs 10 tokens, a
//   health check 0, a read 1. Why is this better than one limit per route?
//
// Task 7:
//   Write the test that would have caught the X-Forwarded-For spoofing bug
//   in CI — it is four lines and it never regresses again.
//
// Task 8:
//   Measure memory for a sliding log at 1,000 requests/second/key over a
//   15-minute window. Now explain, with the number, why fixed windows are
//   still popular.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Rate limiting is three independent decisions — key, algorithm, store —
//   and the library's defaults for all three are wrong in production.
//
// If you remember the common bug:
//   The key. Socket IP locks out everyone behind a NAT; raw X-Forwarded-For
//   means there is no limit at all. Trust exactly the number of proxies you
//   have.
//
// If you remember the professional framing:
//   Limiter above the expensive routes, health checks skipped, RateLimit-*
//   and Retry-After always set, a shared store the moment you run more than
//   one process, and separate per-IP, per-account and global limiters on
//   authentication endpoints.
//
// ─────────────────────────────────────────────────────────────────
// Every middleware so far has worked from headers and the URL alone. The
// next one is the first that has to consume the request BODY — the stream
// 07 §5 proved can only be read once.
//
// NEXT TOPIC -> 13_body-parsing-json-urlencoded.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  section5();
  section6();
  await section7();
  section8();
  section9();
  assertions();
})();
