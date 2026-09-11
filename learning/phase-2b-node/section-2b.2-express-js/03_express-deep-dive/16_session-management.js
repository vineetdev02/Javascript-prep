// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  16_session-management.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Session management
//
// WHAT YOU WILL MASTER HERE:
//   1. The trade the whole design rests on: an opaque id in the cookie, the
//      state in a store — proven by showing the client can see the id and
//      nothing else
//   2. A working express-session: store interface, id generation, cookie,
//      req.session, and save-on-finish
//   3. Session fixation executed: an attacker fixes the id BEFORE login and
//      inherits the authenticated session — then regenerate() stopping it
//   4. Logout done wrong: clearing the cookie while the server-side session
//      lives, and the replayed cookie that still works
//   5. Revocation as the actual difference from a stateless token, measured
//      in one table
//   6. MemoryStore in production: per-process like the rate limiter (12 §8),
//      and an unbounded leak — both counted
//   7. Idle vs absolute timeouts, and the rolling-session mistake
//   8. CSRF tokens bound to the session — the half of the defence SameSite
//      (15 §7) cannot cover
//   9. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/16_session-management.js"
//
// Prerequisites: 15_cookie-parser.js in full — especially §5 (signing is not
// secrecy) and §7 (SameSite) — plus 12 §8 (an in-memory store is per-process)
// and 10 §4 (a cross-site POST reaches your handler).


const http = require("http");
const crypto = require("crypto");

const results = {};

const clock = { t: Date.UTC(2026, 7, 31, 9, 0, 0) };
const now = () => clock.t;
const advance = (ms) => { clock.t += ms; };

const SECRET = "session-signing-secret";


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Session management:
// keeping per-user state on the SERVER, keyed by a random identifier that is
// the only thing stored in the client's cookie — so the browser carries a
// meaningless token and every fact about the user stays somewhere you
// control and can change or delete at any moment.
//
// If interviewer says "explain it simply", say:
//   "On login the server generates a random id, saves the user's state under
//    that id in a store, and sets the id in a cookie. On every later request
//    the cookie comes back, the middleware looks the id up, and attaches the
//    state as req.session. The client never holds any of the data — just a
//    number that means nothing without the store."
//
// If interviewer says "why not put the data in the cookie?", say:
//   "Two reasons. Size: cookies are about 4 KB and every one of those bytes
//    is uploaded on every request. And revocation: anything in the cookie is
//    a copy the server cannot take back. A session id can be deleted from
//    the store and it stops working on the very next request — that is the
//    one capability a self-contained token does not have, and it is the
//    whole reason to choose sessions."
//
// Why it matters in interviews:
//   "Sessions vs JWT" is asked constantly and usually answered with
//   stateless-versus-stateful. The real axis is revocation, and this file
//   measures it. Fixation and incomplete logout are the two bugs that
//   separate people who have implemented auth from people who have used it.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   THE COOKIE IS A POINTER. THE STORE IS THE TRUTH. THE POINTER IS SWAPPED
//   AT EVERY PRIVILEGE CHANGE.
//
// Runtime rule:
//   read the session cookie → look the id up in the store → miss? mint a new
//   empty session → attach as req.session → let handlers mutate it → persist
//   on response finish → re-send the cookie if it is new or rolling.
//
// Practical rule:
//   HttpOnly + Secure + SameSite=Lax on the cookie, a shared store in any
//   multi-process deployment, regenerate() on every privilege change,
//   destroy() on logout, and both an idle and an absolute timeout.
//
// Common trap:
//   Logout that only clears the cookie. The server-side session is still
//   there, so anyone holding a copy of the old cookie value — a proxy log, a
//   shared machine, an XSS that grabbed it earlier — is still logged in.
//
// The mental picture:
//
//   COOKIE                        STORE (Redis / DB)
//   sid = s:9f3a…(signed)  ─────▶ "9f3a…": { userId: 42, role: "admin",
//                                            createdAt, lastSeen }
//        4 KB budget                 unlimited, revocable, invisible
//        client-visible id           server-only truth
//
//   login    → regenerate: new id, old id deleted   (§5)
//   logout   → destroy: id removed from the store   (§6)


// ══════════════════════════════════════════════════════════════════
// § 3 — IMPLEMENTING express-session
// ══════════════════════════════════════════════════════════════════

function MemoryStore() {
  const map = new Map();
  return {
    name: "MemoryStore",
    get: (sid) => map.get(sid) || null,
    set: (sid, data) => { map.set(sid, data); },
    destroy: (sid) => { map.delete(sid); },
    all: () => [...map.entries()],
    length: () => map.size,
    // NOTE: no eviction of any kind. That absence is §7.
  };
}

function sign(value, secret) {
  return "s:" + value + "." +
    crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
}
function unsign(signed, secret) {
  if (!signed || !signed.startsWith("s:")) return false;
  const body = signed.slice(2);
  const i = body.lastIndexOf(".");
  if (i === -1) return false;
  const value = body.slice(0, i);
  const expected = crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
  const a = Buffer.from(body.slice(i + 1)), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : false;
}

function session({
  store = MemoryStore(),
  secret = SECRET,
  name = "sid",
  maxAge = 30 * 60_000,          // idle timeout
  absoluteMaxAge = 12 * 3600_000, // absolute lifetime
  rolling = true,
  cookie = { httpOnly: true, secure: true, sameSite: "Lax", path: "/" },
} = {}) {
  const newId = () => crypto.randomBytes(24).toString("hex");

  function issueCookie(res, sid) {
    let header = name + "=" + encodeURIComponent(sign(sid, secret)) +
      "; Max-Age=" + Math.floor(maxAge / 1000) + "; Path=" + cookie.path;
    if (cookie.httpOnly) header += "; HttpOnly";
    if (cookie.secure) header += "; Secure";
    if (cookie.sameSite) header += "; SameSite=" + cookie.sameSite;
    res.setHeader("set-cookie", header);
  }

  return function sessionMiddleware(req, res, next) {
    const raw = (/(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || "") || [])[1];
    const presented = raw ? unsign(decodeURIComponent(raw), secret) : false;

    let sid = null;
    let data = null;

    if (presented) {
      const stored = store.get(presented);
      if (stored) {
        const idleExpired = now() - stored.lastSeen > maxAge;
        const absoluteExpired = now() - stored.createdAt > absoluteMaxAge;
        if (idleExpired || absoluteExpired) {
          store.destroy(presented);                 // §7
          req.sessionExpired = idleExpired ? "idle" : "absolute";
        } else {
          sid = presented;
          data = stored;
        }
      }
    }

    let isNew = false;
    if (!sid) { sid = newId(); data = { createdAt: now(), lastSeen: now(), values: {} }; isNew = true; }

    req.sessionID = sid;
    req.session = data.values;

    // The two operations that make sessions safe (§5, §6).
    req.session.regenerate = () => {
      store.destroy(sid);                            // the OLD id stops working
      sid = newId();
      data = { createdAt: now(), lastSeen: now(), values: {} };
      req.sessionID = sid;
      req.session = Object.assign(data.values, { regenerate: req.session.regenerate, destroy: req.session.destroy });
      issueCookie(res, sid);
      return sid;
    };
    req.session.destroy = () => {
      store.destroy(sid);
      res.setHeader("set-cookie", name + "=; Max-Age=0; Path=" + cookie.path);
      req.sessionDestroyed = true;
    };

    if (isNew || rolling) issueCookie(res, sid);

    // Persist when the response finishes (07 §3) — not after next().
    res.on("finish", () => {
      if (req.sessionDestroyed) return;
      const { regenerate, destroy, ...values } = req.session;
      store.set(req.sessionID, { createdAt: data.createdAt, lastSeen: now(), values });
    });

    next();
  };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    get(path, fn) { stack.push({ path, fn }); return app; },
    post(path, fn) { stack.push({ path, method: "POST", fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next() {
            const layer = stack[i++];
            if (!layer) { res.statusCode = 404; return res.end("not found"); }
            if (layer.path && layer.path !== urlPath) return next();
            if (layer.method && layer.method !== req.method) return next();
            layer.fn(req, res, next);
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

function request(port, path, { method = "GET", cookie = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: h }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const setCookie = [].concat(res.headers["set-cookie"] || [])[0] || null;
        resolve({
          status: res.statusCode, body, headers: res.headers,
          setCookie,
          cookieValue: setCookie ? setCookie.split(";")[0] : null,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE ROUND TRIP: A POINTER, NOT THE DATA
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — what the client holds ══\n");

  const store = MemoryStore();
  const app = miniExpress();
  app.use(session({ store }));
  app.post("/login", (req, res) => {
    req.session.regenerate();                                    // §5
    req.session.userId = 42;
    req.session.role = "admin";
    req.session.email = "ada@example.com";
    res.end("logged in");
  });
  app.get("/me", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      sessionId: req.sessionID.slice(0, 12) + "…",
      userId: req.session.userId ?? null,
      role: req.session.role ?? null,
    }));
  });

  const { server, port } = await app.listen();

  const login = await request(port, "/login", { method: "POST" });
  const cookie = login.cookieValue;
  const me = JSON.parse((await request(port, "/me", { cookie })).body);
  const anonymous = JSON.parse((await request(port, "/me")).body);

  server.close();

  const storedEntry = store.all()[0];

  results.roundTrip = {
    setCookie: login.setCookie,
    cookieCarriesEmail: /ada@example\.com/.test(login.setCookie),
    cookieCarriesRole: /admin/.test(login.setCookie),
    cookieBytes: Buffer.byteLength(login.setCookie),
    me,
    anonymous,
    storeContains: storedEntry ? storedEntry[1].values : null,
    storeSize: store.length(),
  };

  console.log("  Set-Cookie after login:");
  console.log("    " + login.setCookie);
  console.log("\n  does that cookie contain the email?", results.roundTrip.cookieCarriesEmail);
  console.log("  does it contain the role?          ", results.roundTrip.cookieCarriesRole);
  console.log("  cookie size:", results.roundTrip.cookieBytes, "bytes\n");
  console.log("  what the STORE holds:", JSON.stringify(results.roundTrip.storeContains));
  console.log("  GET /me with the cookie   →", JSON.stringify(me));
  console.log("  GET /me without a cookie  →", JSON.stringify(anonymous));
  console.log("\n  The cookie is a random 48-hex-character pointer and nothing else. The");
  console.log("  role, the email and the user id never left the server, which is the");
  console.log("  direct answer to 15 §5: a signed cookie could have carried role=admin");
  console.log("  unforgeably, and it would still have been readable by the user and");
  console.log("  impossible to revoke. Here, changing someone's role is a write to the");
  console.log("  store and it takes effect on their very next request.");
  console.log("\n  Note also the anonymous request: no cookie means a brand-new empty");
  console.log("  session, not an error. That is why every visitor costs a store entry");
  console.log("  unless you avoid creating sessions for requests that do not need one");
  console.log("  (saveUninitialized: false) — and it is half of §7's leak.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — SESSION FIXATION
// ══════════════════════════════════════════════════════════════════
//
// The attack that regenerate() exists for. The attacker does not steal a
// session — they DONATE one, and wait for you to authenticate it.

async function section5() {
  console.log("\n══ § 5 — the session you were given before you logged in ══\n");

  async function run({ regenerateOnLogin }) {
    const store = MemoryStore();
    const app = miniExpress();
    app.use(session({ store }));
    app.get("/", (req, res) => res.end("home"));                 // creates a session
    app.post("/login", (req, res) => {
      if (regenerateOnLogin) req.session.regenerate();           // ✅ or 🐛 if skipped
      req.session.userId = 42;
      req.session.role = "admin";
      res.end("logged in");
    });
    app.get("/me", (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ userId: req.session.userId ?? null, sid: req.sessionID }));
    });

    const { server, port } = await app.listen();

    // 1. The attacker visits the site and receives a session id.
    const attackerVisit = await request(port, "/");
    const attackerCookie = attackerVisit.cookieValue;

    // 2. They trick the victim into using that id (a link with the id, a
    //    subdomain cookie injection, an XSS on a sibling app…).
    // 3. The victim logs in WITH THAT COOKIE.
    const victimLogin = await request(port, "/login", { method: "POST", cookie: attackerCookie });
    const victimCookie = victimLogin.cookieValue || attackerCookie;

    // 4. The attacker replays their ORIGINAL cookie.
    const attackerCheck = JSON.parse((await request(port, "/me", { cookie: attackerCookie })).body);
    const victimCheck = JSON.parse((await request(port, "/me", { cookie: victimCookie })).body);

    server.close();
    return {
      attackerGotAdmin: attackerCheck.userId === 42,
      victimOk: victimCheck.userId === 42,
      idChangedAtLogin: victimCookie !== attackerCookie,
      storeSize: store.length(),
    };
  }

  results.fixationVulnerable = await run({ regenerateOnLogin: false });
  results.fixationFixed = await run({ regenerateOnLogin: true });

  console.log("  WITHOUT regenerate() on login:");
  console.log("    session id changed at login   :", results.fixationVulnerable.idChangedAtLogin);
  console.log("    victim is logged in           :", results.fixationVulnerable.victimOk);
  console.log("    ATTACKER's old cookie is admin:", results.fixationVulnerable.attackerGotAdmin, " 🐛");
  console.log("\n  WITH regenerate() on login:");
  console.log("    session id changed at login   :", results.fixationFixed.idChangedAtLogin, " ✅");
  console.log("    victim is logged in           :", results.fixationFixed.victimOk, " ✅");
  console.log("    ATTACKER's old cookie is admin:", results.fixationFixed.attackerGotAdmin, " ✅ rejected");
  console.log("    sessions left in the store    :", results.fixationFixed.storeSize,
              "← the victim's, plus a fresh empty one");
  console.log("      (the attacker's replay found nothing and was handed a brand-new");
  console.log("       anonymous session — correct, and also §7's leak in miniature:");
  console.log("       every unrecognised cookie mints a stored session)");
  console.log("\n  Read the mechanism once and it is obvious forever: the id is a pointer,");
  console.log("  and logging in changed what the pointer POINTS TO without changing the");
  console.log("  pointer. Anyone else already holding it is now pointing at an");
  console.log("  authenticated session.");
  console.log("\n  So the rule is not 'regenerate on login', it is: regenerate at EVERY");
  console.log("  privilege change. Login, logout, password change, elevation to an admin");
  console.log("  mode, switching accounts, accepting an invitation. Any moment where");
  console.log("  what the session can DO changes, the id changes with it.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — LOGOUT, AND WHAT REVOCATION ACTUALLY MEANS
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — clearing a cookie is not logging out ══\n");

  async function run({ destroyOnLogout }) {
    const store = MemoryStore();
    const app = miniExpress();
    app.use(session({ store }));
    app.post("/login", (req, res) => { req.session.regenerate(); req.session.userId = 42; res.end("in"); });
    app.post("/logout", (req, res) => {
      if (destroyOnLogout) req.session.destroy();               // ✅ server-side
      else res.setHeader("set-cookie", "sid=; Max-Age=0; Path=/");  // 🐛 client-side only
      res.end("out");
    });
    app.get("/me", (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ userId: req.session.userId ?? null }));
    });

    const { server, port } = await app.listen();
    const login = await request(port, "/login", { method: "POST" });
    const cookie = login.cookieValue;
    const beforeLogout = JSON.parse((await request(port, "/me", { cookie })).body);
    await request(port, "/logout", { method: "POST", cookie });
    const storeAfterLogout = store.length();          // measured BEFORE the replay
    // The user's browser dropped the cookie — but a COPY still exists.
    const replay = JSON.parse((await request(port, "/me", { cookie })).body);
    server.close();
    return {
      beforeLogout: beforeLogout.userId,
      afterReplay: replay.userId,
      storeAfterLogout,
      storeAtEnd: store.length(),                     // the replay minted a fresh one
    };
  }

  results.logoutCookieOnly = await run({ destroyOnLogout: false });
  results.logoutDestroy = await run({ destroyOnLogout: true });

  console.log("  logout that only clears the cookie:");
  console.log("    before logout, /me →", results.logoutCookieOnly.beforeLogout);
  console.log("    replaying the OLD cookie afterwards →", results.logoutCookieOnly.afterReplay,
              " 🐛 still logged in");
  console.log("    sessions in the store right after logout:", results.logoutCookieOnly.storeAfterLogout,
              " 🐛 the record survived");
  console.log("\n  logout that calls destroy():");
  console.log("    before logout, /me →", results.logoutDestroy.beforeLogout);
  console.log("    replaying the OLD cookie afterwards →", results.logoutDestroy.afterReplay,
              " ✅ anonymous");
  console.log("    sessions in the store right after logout:", results.logoutDestroy.storeAfterLogout,
              " ✅ the record is gone");
  console.log("    …and", results.logoutDestroy.storeAtEnd,
              "after the replay, because an unrecognised cookie mints a fresh empty session (§7)");
  console.log("\n  Clearing a cookie is a REQUEST to a browser that may or may not honour");
  console.log("  it, and it does nothing about copies that already escaped — a proxy");
  console.log("  log, a shared computer, an XSS that read it an hour ago, a screenshot");
  console.log("  of a support session. Only deleting the server-side record ends the");
  console.log("  session for everyone holding it.");
  console.log("\n  And that is the honest sessions-versus-token comparison:");
  console.log("");
  console.log("                            session id        self-contained token");
  console.log("    where the state lives   server store      inside the token");
  console.log("    revoke one user now     delete one row    …needs a denylist,");
  console.log("                                              i.e. server state again");
  console.log("    log out everywhere      delete by userId  wait for expiry");
  console.log("    change a role instantly write the store   wait for re-issue");
  console.log("    cost per request        one store read    signature verify only");
  console.log("");
  console.log("  A stateless token buys you no store read on the request path. It pays");
  console.log("  for that by being un-revocable — and the moment a product needs 'log");
  console.log("  this device out', teams add a denylist and end up with a store on the");
  console.log("  request path anyway, plus a token. Choose deliberately, not by default.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — MemoryStore, AND THE TIMEOUTS
// ══════════════════════════════════════════════════════════════════

async function section7() {
  console.log("\n══ § 7 — the default store, and expiry ══\n");

  // (a) MemoryStore is per-process — exactly 12 §8's problem, with worse
  //     consequences: not a loose limit, but users randomly logged out.
  const storeA = MemoryStore(), storeB = MemoryStore();
  const instanceA = miniExpress(); instanceA.use(session({ store: storeA }));
  instanceA.post("/login", (req, res) => { req.session.regenerate(); req.session.userId = 7; res.end("in"); });
  instanceA.get("/me", (req, res) => res.end(JSON.stringify({ userId: req.session.userId ?? null })));
  const instanceB = miniExpress(); instanceB.use(session({ store: storeB }));
  instanceB.get("/me", (req, res) => res.end(JSON.stringify({ userId: req.session.userId ?? null })));

  const shared = MemoryStore();
  const instanceC = miniExpress(); instanceC.use(session({ store: shared }));
  instanceC.post("/login", (req, res) => { req.session.regenerate(); req.session.userId = 7; res.end("in"); });
  const instanceD = miniExpress(); instanceD.use(session({ store: shared }));
  instanceD.get("/me", (req, res) => res.end(JSON.stringify({ userId: req.session.userId ?? null })));

  const a = await instanceA.listen(), b = await instanceB.listen();
  const c = await instanceC.listen(), d = await instanceD.listen();

  const cookieAB = (await request(a.port, "/login", { method: "POST" })).cookieValue;
  const onSameInstance = JSON.parse((await request(a.port, "/me", { cookie: cookieAB })).body);
  const onOtherInstance = JSON.parse((await request(b.port, "/me", { cookie: cookieAB })).body);

  const cookieCD = (await request(c.port, "/login", { method: "POST" })).cookieValue;
  const onSharedOther = JSON.parse((await request(d.port, "/me", { cookie: cookieCD })).body);

  a.server.close(); b.server.close(); c.server.close(); d.server.close();

  results.storeSharing = {
    sameInstance: onSameInstance.userId,
    otherInstance: onOtherInstance.userId,
    sharedStoreOtherInstance: onSharedOther.userId,
  };

  console.log("  (a) two processes, one load balancer:");
  console.log("      request routed back to the SAME instance →", JSON.stringify(onSameInstance));
  console.log("      routed to the OTHER instance             →", JSON.stringify(onOtherInstance),
              " 🐛 logged out at random");
  console.log("      with a SHARED store, other instance      →", JSON.stringify(onSharedOther), " ✅");

  // (b) the leak: sessions accumulate, nothing evicts them.
  const leaky = MemoryStore();
  const app = miniExpress();
  app.use(session({ store: leaky, maxAge: 30 * 60_000 }));
  app.get("/", (req, res) => res.end("home"));
  const { server, port } = await app.listen();

  for (let i = 0; i < 200; i++) await request(port, "/");        // 200 anonymous visitors
  const afterVisitors = leaky.length();

  advance(31 * 60_000);                                          // half an hour later
  await request(port, "/");                                       // one more visitor
  const afterTime = leaky.length();
  server.close();

  results.leak = { afterVisitors, afterTime };

  console.log("\n  (b) 200 anonymous visitors, none of whom logged in:");
  console.log("      sessions in the store:", afterVisitors, " 🐛 one per visitor");
  console.log("      31 minutes later, after one more request:", afterTime);
  console.log("      …the expired ones are STILL there — expiry is checked lazily, when");
  console.log("      a session is presented. Nobody presents an abandoned one, so it is");
  console.log("      never checked and never removed.");
  console.log("\n  That is the MemoryStore leak in one number: it grows with TRAFFIC, not");
  console.log("  with logged-in users, and only a restart clears it. Two fixes, and you");
  console.log("  want both: saveUninitialized: false so a session is only created once");
  console.log("  something is actually stored in it, and a real store (Redis) whose");
  console.log("  entries carry a TTL so eviction is the database's job, not yours.");

  // (c) idle vs absolute
  const store2 = MemoryStore();
  const app2 = miniExpress();
  app2.use(session({ store: store2, maxAge: 30 * 60_000, absoluteMaxAge: 2 * 3600_000, rolling: true }));
  app2.post("/login", (req, res) => { req.session.regenerate(); req.session.userId = 1; res.end("in"); });
  app2.get("/me", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ userId: req.session.userId ?? null, expired: req.sessionExpired ?? null }));
  });
  const s2 = await app2.listen();

  let cookie = (await request(s2.port, "/login", { method: "POST" })).cookieValue;
  // Active user: a request every 20 minutes keeps the idle timer alive…
  const activity = [];
  for (let i = 0; i < 6; i++) {                 // 20, 40, 60, 80, 100, 120 minutes
    advance(20 * 60_000);
    const r = await request(s2.port, "/me", { cookie });
    if (r.cookieValue) cookie = r.cookieValue;
    activity.push(JSON.parse(r.body).userId);
  }
  // …until the ABSOLUTE lifetime runs out regardless. Note the gap here is
  // still only 20 minutes, well inside the idle window — so the expiry that
  // fires can only be the absolute one.
  advance(20 * 60_000);                          // 140 minutes since login
  const afterAbsolute = JSON.parse((await request(s2.port, "/me", { cookie })).body);

  // Idle timeout on a different session:
  let idleCookie = (await request(s2.port, "/login", { method: "POST" })).cookieValue;
  advance(45 * 60_000);
  const afterIdle = JSON.parse((await request(s2.port, "/me", { cookie: idleCookie })).body);

  s2.server.close();

  results.timeouts = {
    activeChecks: activity,
    stillAliveAt80Min: activity[3],
    afterAbsolute: afterAbsolute.userId,
    afterAbsoluteReason: afterAbsolute.expired,
    afterIdle: afterIdle.userId,
    afterIdleReason: afterIdle.expired,
  };

  console.log("\n  (c) rolling 30-minute idle timeout, 2-hour absolute lifetime:");
  console.log("      a user active every 20 minutes:", activity.map((u) => u ?? "—").join(" "));
  console.log("      after the 2-hour absolute limit →", JSON.stringify(afterAbsolute), " ✅ expired anyway");
  console.log("      a user idle for 45 minutes      →", JSON.stringify(afterIdle), " ✅ expired");
  console.log("\n  Both timers are needed and they answer different questions. The idle");
  console.log("  timeout ends abandoned sessions on shared machines. The absolute one");
  console.log("  bounds the damage from a stolen cookie — without it, 'rolling' means a");
  console.log("  thief who keeps making one request every 29 minutes stays logged in");
  console.log("  forever.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — CSRF TOKENS: THE OTHER HALF OF THE DEFENCE
// ══════════════════════════════════════════════════════════════════
//
// 15 §7 showed SameSite=Lax stopping a cross-site form POST. But SameSite is
// a browser default, non-browser clients ignore it, and any endpoint that
// genuinely needs SameSite=None loses it entirely. The token is what does
// not depend on the browser cooperating.

async function section8() {
  console.log("\n══ § 8 — a token bound to the session ══\n");

  const store = MemoryStore();
  const app = miniExpress();
  app.use(session({ store, cookie: { httpOnly: true, secure: true, sameSite: "None", path: "/" } }));

  app.get("/form", (req, res) => {
    req.session.csrfToken ||= crypto.randomBytes(16).toString("hex");    // per session
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ csrfToken: req.session.csrfToken }));
  });

  const requireCsrf = (req, res, next) => {
    const presented = req.headers["x-csrf-token"];
    const expected = req.session.csrfToken;
    const ok = expected && presented &&
      presented.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
    if (!ok) { res.statusCode = 403; return res.end(JSON.stringify({ error: "invalid csrf token" })); }
    next();
  };

  app.post("/transfer", (req, res) => {
    requireCsrf(req, res, () => {
      req.session.transfers = (req.session.transfers || 0) + 1;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, transfers: req.session.transfers }));
    });
  });

  const { server, port } = await app.listen();

  const first = await request(port, "/form");
  const cookie = first.cookieValue;
  const { csrfToken } = JSON.parse((await request(port, "/form", { cookie })).body);

  // legitimate: cookie + matching token
  const legit = await request(port, "/transfer", {
    method: "POST", cookie, headers: { "x-csrf-token": csrfToken },
  });
  // CSRF: the browser attached the cookie (SameSite=None) but the attacker
  // cannot READ the token — that is 10 §4 all over again, working FOR us.
  const attack = await request(port, "/transfer", { method: "POST", cookie });
  // …and a guessed token
  const guessed = await request(port, "/transfer", {
    method: "POST", cookie, headers: { "x-csrf-token": crypto.randomBytes(16).toString("hex") },
  });
  // a token from a DIFFERENT session
  const other = await request(port, "/form");
  const otherToken = JSON.parse((await request(port, "/form", { cookie: other.cookieValue })).body).csrfToken;
  const crossSession = await request(port, "/transfer", {
    method: "POST", cookie, headers: { "x-csrf-token": otherToken },
  });

  server.close();

  results.csrf = {
    legit: legit.status,
    noToken: attack.status,
    guessed: guessed.status,
    crossSession: crossSession.status,
    tokenLength: csrfToken.length,
  };

  console.log("  cookie + matching token      →", legit.status, legit.body, " ✅");
  console.log("  cookie, NO token (the CSRF)  →", attack.status, attack.body, " ✅ blocked");
  console.log("  cookie + guessed token       →", guessed.status, " ✅ blocked");
  console.log("  cookie + ANOTHER session's   →", crossSession.status, " ✅ blocked");
  console.log("\n  The attacker's page could make the browser send the cookie — that is");
  console.log("  exactly what 10 §4 proved and what SameSite=None re-enables here. What");
  console.log("  it could not do is READ a response from your origin to learn the token,");
  console.log("  because THAT is the thing the same-origin policy actually blocks. So");
  console.log("  the token turns 'can the browser be made to send a request' into 'can");
  console.log("  the attacker read a response', and the answer to the second is no.");
  console.log("\n  Three implementation rules that follow:");
  console.log("   • Bind the token to the SESSION and check it server-side. A token the");
  console.log("     server does not remember proves nothing.");
  console.log("   • Compare in constant time, like every other secret (13 §7).");
  console.log("   • Only state-changing methods need it. Requiring it on GET breaks");
  console.log("     links and pushes people toward exempting things.");
  console.log("\n  With SameSite=Lax AND a session-bound token you need the browser to");
  console.log("  fail one check and the attacker to break the other. That is why both");
  console.log("  ship together.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — No regenerate() on login: session fixation, and the attacker's
//   donated id becomes an authenticated one. → §5
//
// Bug 2 — Logout that only clears the cookie, leaving the server-side
//   session valid for anyone with a copy. → §6
//
// Bug 3 — MemoryStore in production: users randomly logged out as the load
//   balancer moves them between processes. → §7
//
// Bug 4 — MemoryStore growing with traffic, since expiry is lazy and
//   abandoned sessions are never presented again. → §7
//
// Bug 5 — saveUninitialized left on, so every crawler and health check
//   creates a stored session. → §4, §7
//
// Bug 6 — rolling: true with no absolute lifetime, so a stolen cookie kept
//   warm never expires. → §7
//
// Bug 7 — Session data treated as a cache: large objects per session,
//   multiplied by every visitor, in a store sized for identifiers.
//
// Bug 8 — Session cookie without HttpOnly, so XSS lifts the id and the
//   whole design collapses to a stolen bearer token. → 15 §6
//
// Bug 9 — CSRF token not bound to the session, or compared with ===. → §8
//
// Bug 10 — Requiring a CSRF token on GET, then adding exemptions that grow
//   into the hole. → §8
//
// Bug 11 — Role changes that do not take effect because the role was copied
//   into the session at login and never refreshed — a stale-permission bug
//   that looks exactly like the token problem sessions were meant to avoid.
//
// Bug 12 — Session writes on every request (rolling + a touched field)
//   turning the store into a write-heavy hot path.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — pointer, not payload:
  const rt = results.roundTrip;
  assert.equal(rt.cookieCarriesEmail, false, "the cookie carried no email ✅");
  assert.equal(rt.cookieCarriesRole, false, "…and no role — only an opaque id ✅");
  assert.ok(rt.cookieBytes < 200, "…in under 200 bytes (" + rt.cookieBytes + ")");
  assert.deepEqual(rt.storeContains, { userId: 42, role: "admin", email: "ada@example.com" },
    "…while the STORE held every field, server-side ✅");
  assert.deepEqual({ userId: rt.me.userId, role: rt.me.role }, { userId: 42, role: "admin" },
    "…and the request with the cookie resolved back to that state");
  assert.equal(rt.anonymous.userId, null, "…a request with no cookie got a fresh empty session");
  assert.ok(rt.setCookie.includes("HttpOnly") && rt.setCookie.includes("SameSite=Lax"),
    "…with HttpOnly and SameSite set on the cookie (15 §6, §7) ✅");

  // § 5 — fixation:
  assert.equal(results.fixationVulnerable.idChangedAtLogin, false,
    "without regenerate() the session id survived the login 🐛");
  assert.equal(results.fixationVulnerable.attackerGotAdmin, true,
    "…so the attacker's pre-login cookie became an ADMIN session 🐛");
  assert.equal(results.fixationFixed.idChangedAtLogin, true,
    "with regenerate() the id changed at login ✅");
  assert.equal(results.fixationFixed.victimOk, true, "…the victim was still logged in ✅");
  assert.equal(results.fixationFixed.attackerGotAdmin, false,
    "…and the attacker's old cookie resolved to nothing ✅");
  assert.equal(results.fixationFixed.storeSize, 2,
    "…leaving the victim's session plus one fresh anonymous session for the attacker's " +
    "rejected replay — the old id itself was destroyed, not orphaned ✅");

  // § 6 — logout:
  assert.equal(results.logoutCookieOnly.beforeLogout, 42);
  assert.equal(results.logoutCookieOnly.afterReplay, 42,
    "clearing only the cookie left the old value fully usable 🐛");
  assert.equal(results.logoutCookieOnly.storeAfterLogout, 1,
    "…because the server-side session was still there 🐛");
  assert.equal(results.logoutDestroy.afterReplay, null,
    "destroy() made the replayed cookie anonymous ✅");
  assert.equal(results.logoutDestroy.storeAfterLogout, 0,
    "…because destroy() removed the record entirely ✅");
  assert.equal(results.logoutDestroy.storeAtEnd, 1,
    "…while the rejected replay was handed a fresh empty session, which is §7's leak again");

  // § 7 — store and timeouts:
  assert.equal(results.storeSharing.sameInstance, 7, "the session resolved on the instance that created it");
  assert.equal(results.storeSharing.otherInstance, null,
    "…and was MISSING on a second process with its own MemoryStore 🐛");
  assert.equal(results.storeSharing.sharedStoreOtherInstance, 7,
    "…while a shared store resolved it on either process ✅");
  assert.equal(results.leak.afterVisitors, 200,
    "200 anonymous visitors created 200 stored sessions 🐛");
  assert.equal(results.leak.afterTime, 201,
    "…and half an hour later none had been evicted — expiry is lazy 🐛");
  assert.equal(results.timeouts.stillAliveAt80Min, 1,
    "a user active every 20 minutes stayed logged in past the 30-minute idle timeout ✅");
  assert.equal(results.timeouts.afterAbsolute, null,
    "…until the 2-hour ABSOLUTE lifetime ended it regardless of activity ✅");
  assert.equal(results.timeouts.afterAbsoluteReason, "absolute");
  assert.equal(results.timeouts.afterIdle, null, "…and 45 minutes of inactivity ended a different session ✅");
  assert.equal(results.timeouts.afterIdleReason, "idle");

  // § 8 — CSRF:
  assert.equal(results.csrf.legit, 200, "cookie + matching session-bound token was accepted ✅");
  assert.equal(results.csrf.noToken, 403,
    "…a request with the cookie but no token — the CSRF shape — was refused ✅");
  assert.equal(results.csrf.guessed, 403, "…a guessed token was refused ✅");
  assert.equal(results.csrf.crossSession, 403,
    "…and a VALID token from another session was refused, because it is bound ✅");
  assert.equal(results.csrf.tokenLength, 32, "…the token being 16 random bytes");

  console.log("§10 — mini assertions passed for: Session management");
  console.log("\n  The pair that captures it: without regenerate() the attacker's own");
  console.log("  pre-login cookie came back as userId 42 — and a logout that only");
  console.log("  cleared the cookie left that same cookie working perfectly.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does session management work?", answer:
//
//   "On login the server generates a random id, stores the user's state
//    under it, and puts the id — signed — in an HttpOnly, Secure,
//    SameSite=Lax cookie. Every later request presents that id, the
//    middleware looks it up and attaches req.session, and the session is
//    persisted when the response finishes. The cookie is a pointer; the
//    store is the truth. Nothing about the user travels to the client, which
//    matters for the 4 KB cookie budget and much more for revocation.
//
//    Two operations make it safe, and both get skipped. First, regenerate on
//    every privilege change. Without it you have session fixation: an
//    attacker obtains a session id, gets the victim to use it, the victim
//    logs in, and because logging in changed what the pointer points to
//    without changing the pointer, the attacker's original cookie is now an
//    authenticated admin session. I can reproduce that in about twenty
//    lines. Second, logout has to destroy the server-side record. Clearing
//    the cookie is a polite request to one browser — it does nothing about
//    copies in a proxy log, on a shared machine, or lifted by an XSS an hour
//    earlier. Replaying the old value still works.
//
//    That second point is also the honest sessions-versus-token answer. The
//    real axis isn't stateless versus stateful, it's revocation: I can end
//    one user's session, or all of them, with a delete, and it takes effect
//    on the next request. A self-contained token can't be withdrawn — so
//    teams add a denylist and end up with server state on the request path
//    anyway, plus a token.
//
//    In production: never MemoryStore. It's per-process, so a load balancer
//    logs people out at random, and it grows with traffic rather than with
//    logged-in users because expiry is lazy — an abandoned session is never
//    presented, so it's never checked, so it's never evicted. Redis with a
//    TTL, plus saveUninitialized: false so crawlers don't create sessions.
//    Both an idle timeout and an absolute one: rolling alone means a stolen
//    cookie kept warm never expires.
//
//    And CSRF: SameSite=Lax stops the classic form POST, but it's a browser
//    default rather than a guarantee, so state-changing endpoints also get a
//    token bound to the session and compared in constant time. The attacker
//    can make the browser send the cookie; what they can't do is read a
//    response from my origin to learn the token."
//
// Reproducing fixation and the replayed-cookie logout is what makes this
// read as implementation experience.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is actually in the session cookie?
// A1. A signed, opaque, random id. Nothing else (§4).
//
// Q2. Why not put user data in the cookie?
// A2. 4 KB budget, uploaded per request, and unrevocable (§4, 15 §8).
//
// Q3. What is session fixation?
// A3. An attacker supplies an id, the victim authenticates it, the id is
//     unchanged, so the attacker's copy is now privileged (§5).
//
// Q4. When must you regenerate?
// A4. Every privilege change: login, logout, password change, elevation,
//     account switch (§5).
//
// Q5. Why is clearing the cookie not logout?
// A5. The server-side record survives, and copies of the value exist
//     elsewhere (§6).
//
// Q6. Sessions vs JWT — the real difference?
// A6. Revocation. Everything else is a consequence (§6).
//
// Q7. What's wrong with MemoryStore?
// A7. Per-process, and unbounded because expiry is lazy (§7).
//
// Q8. Why does the store grow with traffic?
// A8. Abandoned sessions are never presented, so their expiry is never
//     evaluated. Use a store with TTL eviction (§7).
//
// Q9. Idle vs absolute timeout?
// A9. Idle ends abandoned sessions; absolute bounds the damage from a
//     stolen one. Rolling alone means never expiring (§7).
//
// Q10. Does SameSite remove the need for CSRF tokens?
// A10. No — it's a browser default, ignored by non-browser clients and lost
//      entirely with SameSite=None (§8, 15 §7).
//
// Q11. Why must the CSRF token be bound to the session?
// A11. An unbound token proves nothing; anyone can generate one (§8).
//
// Q12. Why can't the attacker just read the token?
// A12. Reading a response cross-origin is the thing the same-origin policy
//      does block (§8, 10 §4).
//
// Q13. What happens to sessions on deploy?
// A13. With an external store, nothing. With MemoryStore, everyone is
//      logged out — which is also how people discover they're using it.
//
// Q14. How do you implement "log out all devices"?
// A14. Store sessions keyed by user as well, and delete by userId — trivial
//      with a store, and the thing a stateless token cannot do.
//
// Q15. Should the role live in the session?
// A15. Only if you're happy for a role change to take effect at the next
//      login. Otherwise read it fresh, or version the session and
//      invalidate on change (§9 Bug 11).


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What's in the cookie?
//   Back : A signed random id. The state is in the store.
//
// Flashcard 2:
//   Front: Session fixation fix?
//   Back : regenerate() at every privilege change.
//
// Flashcard 3:
//   Front: Is clearing the cookie logout?
//   Back : No. destroy() the server-side session.
//
// Flashcard 4:
//   Front: Sessions vs JWT, the real axis?
//   Back : Revocation.
//
// Flashcard 5:
//   Front: Two MemoryStore problems?
//   Back : Per-process, and unbounded (lazy expiry).
//
// Flashcard 6:
//   Front: Why both timeouts?
//   Back : Idle ends abandoned sessions; absolute bounds a stolen one.
//
// Flashcard 7:
//   Front: saveUninitialized: false does what?
//   Back : Stops crawlers and health checks creating stored sessions.
//
// Flashcard 8:
//   Front: CSRF token must be…?
//   Back : Bound to the session, checked server-side, compared in
//          constant time.
//
// Flashcard 9:
//   Front: Why can't an attacker read the CSRF token?
//   Back : Cross-origin RESPONSE reading is what SOP actually blocks.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "The cookie is a pointer — fixation is what happens when you
//          change what it points to without changing the pointer."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add saveUninitialized: false — only persist a session once something is
//   written to it — and rerun §7(b). The 200 should become 0.
//
// Task 2:
//   Give MemoryStore a TTL sweeper and measure the store size over 1,000
//   simulated visitors across two hours.
//
// Task 3:
//   Implement "log out all devices": index sessions by userId and delete
//   them all. Then explain how you would do the same with stateless tokens.
//
// Task 4:
//   Add a sessionVersion field to the user record, store it in the session,
//   and invalidate on role change. That is Bug 11's fix.
//
// Task 5:
//   Reproduce §5's fixation with the id delivered via a query parameter
//   instead of a cookie. Why is accepting a session id from the URL always
//   wrong?
//
// Task 6:
//   Measure the store read cost per request under load, then compare with a
//   signature-verify-only token path. At what request rate does the
//   difference start to matter?
//
// Task 7:
//   Implement double-submit CSRF (token in a cookie AND a header) and
//   explain what it gives up compared with §8's session-bound token.
//
// Task 8:
//   Add regeneration on privilege ELEVATION (a user entering an admin area)
//   and prove the pre-elevation cookie cannot reach admin routes.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The cookie is a pointer and the store is the truth — which is why a
//   session can be revoked on the next request and a self-contained token
//   cannot.
//
// If you remember the common bug:
//   No regenerate() on login (fixation), and a logout that only clears the
//   cookie while the server-side session keeps working.
//
// If you remember the professional framing:
//   HttpOnly + Secure + SameSite=Lax on an opaque signed id, a shared store
//   with TTL, saveUninitialized: false, regenerate at every privilege
//   change, destroy on logout, idle AND absolute timeouts, and a
//   session-bound CSRF token on state-changing routes.
//
// ─────────────────────────────────────────────────────────────────
// Sessions decide WHO is making the request. The next file is about the
// other question every handler asks before it does anything: whether what
// they sent is acceptable at all.
//
// NEXT TOPIC -> 17_express-validator.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
