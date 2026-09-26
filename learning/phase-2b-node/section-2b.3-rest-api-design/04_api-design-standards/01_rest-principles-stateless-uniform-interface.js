// ╔══════════════════════════════════════════════════════════════════╗
// ║   API Design Standards  →  01_rest-principles-stateless-uniform-interface.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: REST principles (stateless, uniform
//   interface)
//
// WHAT YOU WILL MASTER HERE:
//   1. Statelessness stated precisely — not "no state", but "no CLIENT
//      CONTEXT on the server between requests" — and the difference proven
//      by round-robining one client across three instances
//   2. The server-side cursor that works perfectly on one machine and
//      breaks the moment you scale, versus the cursor carried in the URL
//   3. The uniform interface as four separate constraints, each demonstrated
//      on its own: resource identification, manipulation through
//      representations, self-descriptive messages, and HATEOAS
//   4. Content negotiation: one resource, two representations, chosen by
//      the client's Accept header
//   5. Safe and idempotent methods measured — GET changing nothing, PUT
//      twice leaving one row, POST twice leaving two
//   6. A client that completes a whole workflow knowing only the entry
//      point, because the server sent links
//   7. The honest costs of REST's constraints, and where real APIs break
//      them on purpose
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.3-rest-api-design/04_api-design-standards/01_rest-principles-stateless-uniform-interface.js"
//
// Prerequisites: section-2b.2-express-js/03_express-deep-dive — especially
// 16_session-management.js §7 (an in-memory store is per-process, so a load
// balancer logs users out at random) and 08_res-json-vs-res-send.js §7
// (ETags and conditional requests). This file is the architectural reason
// those two behave the way they do.
//
// This is file 01 of ◆ API Design Standards, and the first file of
// SECTION 2B.3 — REST API DESIGN.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// REST:
// an architectural style defined by a set of CONSTRAINTS — client-server,
// statelessness, cacheability, a uniform interface, a layered system, and
// optionally code-on-demand — which an API either satisfies or does not;
// the two that decide whether a system actually behaves like one are
// statelessness and the uniform interface.
//
// If interviewer says "explain it simply", say:
//   "REST isn't a protocol or a library, it's a set of constraints you
//    accept in exchange for specific properties. Statelessness means every
//    request carries everything needed to understand it — the server keeps
//    no client context between requests — and what you buy for that is
//    horizontal scaling, because any instance can serve any request. The
//    uniform interface means every resource is identified by a URI, you act
//    on it by exchanging representations, each message describes itself, and
//    the responses tell you what you can do next. What you buy there is
//    decoupling: caches, proxies and clients can all work without knowing
//    anything about your domain."
//
// If interviewer says "is a JSON API automatically REST?", say:
//   "No — and most aren't, which is fine as long as it's deliberate. JSON
//    over HTTP with nouns in the URL is the common baseline. Whether it's
//    REST depends on whether it holds the constraints: no server-side
//    session context, correct method semantics, honest status codes and
//    self-describing responses. The one almost nobody implements is HATEOAS,
//    and that's a real trade, not an oversight."
//
// Why it matters in interviews:
//   "Stateless" is the most-recited and least-understood word in backend
//   interviews. The version that lands is: state is fine, CLIENT CONTEXT on
//   the server is not — and here is a working pagination cursor that proves
//   the difference.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   NO CLIENT CONTEXT BETWEEN REQUESTS. RESOURCES, REPRESENTATIONS, LINKS.
//
// Runtime rule:
//   Every request must be understandable in isolation. The server may hold
//   as much RESOURCE state as it likes — that is what a database is — but it
//   may not require memory of what THIS client did last time. Anything a
//   request depends on travels in that request: the URL, the headers, the
//   body.
//
// Practical rule:
//   Put the continuation in the response, not in the server. Cursors go in
//   the next URL, auth goes in a header on every request, and "where the
//   user is in a flow" goes in the resource itself. If restarting a process
//   breaks a client mid-flow, you are not stateless.
//
// Common trap:
//   Confusing "stateless" with "no database" or "no sessions ever". A
//   session id in a cookie is fine — the request carries it, and any
//   instance can resolve it from a SHARED store. What breaks is per-client
//   context living in ONE process's memory.
//
// The mental picture:
//
//   STATEFUL                            STATELESS
//   client ──"next page"──▶ instance A  client ──"?after=id_042"──▶ any
//                  cursor lives here                    cursor travels here
//   client ──"next page"──▶ instance B  client ──"?after=id_084"──▶ any
//                  ✗ no idea who you are               ✓ fully self-describing
//
//   The stateless version is not simpler for the SERVER. It is simpler for
//   everything else: load balancers, caches, retries, restarts, autoscaling.


// ══════════════════════════════════════════════════════════════════
// § 3 — A CLUSTER, AND TWO WAYS TO PAGINATE
// ══════════════════════════════════════════════════════════════════

const ITEMS = Array.from({ length: 25 }, (_, i) => ({
  id: "item_" + String(i + 1).padStart(3, "0"),
  name: "Item " + (i + 1),
}));

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, path, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1", port, path, method,
      headers: { ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...headers },
    }, (res) => {
      let out = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

// A load balancer: round-robin, exactly like a real one, with no affinity.
function roundRobin(ports) {
  let n = 0;
  return () => ports[n++ % ports.length];
}


// ══════════════════════════════════════════════════════════════════
// § 4 — STATELESSNESS, MEASURED
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — the cursor that only works on one machine ══\n");

  // ❌ STATEFUL: the cursor lives in this process's memory, per client.
  function statefulInstance(id) {
    const cursors = new Map();                       // clientId → offset
    return listen((req, res) => {
      const url = new URL(req.url, "http://x");
      const client = req.headers["x-client-id"] || "anon";
      if (url.pathname !== "/items") return json(res, 404, { error: "not found" });

      if (url.searchParams.get("restart") === "1") cursors.set(client, 0);
      const offset = cursors.get(client) ?? 0;
      if (offset >= ITEMS.length && !cursors.has(client)) {
        return json(res, 409, { error: "no cursor on this instance", servedBy: id });
      }
      const page = ITEMS.slice(offset, offset + 5);
      cursors.set(client, offset + page.length);
      json(res, 200, { servedBy: id, offset, items: page.map((i) => i.id) });
    });
  }

  // ✅ STATELESS: the cursor travels in the URL the SERVER handed back.
  function statelessInstance(id) {
    return listen((req, res) => {
      const url = new URL(req.url, "http://x");
      if (url.pathname !== "/items") return json(res, 404, { error: "not found" });

      const after = url.searchParams.get("after");
      const start = after ? ITEMS.findIndex((i) => i.id === after) + 1 : 0;
      const page = ITEMS.slice(start, start + 5);
      const last = page[page.length - 1];
      json(res, 200, {
        servedBy: id,
        items: page.map((i) => i.id),
        // the continuation is part of the REPRESENTATION (§7)
        next: last && start + 5 < ITEMS.length ? "/items?after=" + last.id : null,
      });
    });
  }

  const stateful = [await statefulInstance("A"), await statefulInstance("B"), await statefulInstance("C")];
  const stateless = [await statelessInstance("A"), await statelessInstance("B"), await statelessInstance("C")];

  // ── the stateful client, pinned to one instance: works ──
  const pinned = [];
  for (let i = 0; i < 3; i++) {
    const r = JSON.parse((await request(stateful[0].port, "/items", { headers: { "x-client-id": "c1" } })).body);
    pinned.push(r.items[0]);
  }

  // ── the same client, load balanced: broken ──
  const nextStateful = roundRobin(stateful.map((s) => s.port));
  const balanced = [];
  for (let i = 0; i < 6; i++) {
    const r = JSON.parse((await request(nextStateful(), "/items", { headers: { "x-client-id": "c2" } })).body);
    balanced.push(r.items[0]);
  }

  // ── the stateless client, load balanced: correct ──
  const nextStateless = roundRobin(stateless.map((s) => s.port));
  const walked = [];
  const servers = [];
  let path = "/items";
  while (path) {
    const r = JSON.parse((await request(nextStateless(), path)).body);
    walked.push(...r.items);
    servers.push(r.servedBy);
    path = r.next;
  }

  for (const s of [...stateful, ...stateless]) s.server.close();

  results.statefulPinned = pinned;
  results.statefulBalanced = balanced;
  results.statefulDuplicates = balanced.length - new Set(balanced).size;
  results.statelessWalked = walked;
  results.statelessUnique = new Set(walked).size;
  results.statelessServers = servers;
  results.statelessInstancesUsed = new Set(servers).size;

  console.log("  STATEFUL, client pinned to instance A (sticky sessions):");
  console.log("    first item of each page:", pinned.join(", "), " ✅ advances correctly");
  console.log("\n  the SAME server, client load balanced across A/B/C:");
  console.log("    first item of each page:", balanced.join(", "));
  console.log("    repeated pages:", results.statefulDuplicates, "of 6 🐛");
  console.log("\n  STATELESS, load balanced across A/B/C:");
  console.log("    items collected:", walked.length, " unique:", results.statelessUnique);
  console.log("    instances that served the walk:", results.statelessServers.join(" → "));
  console.log("\n  The stateful version is not wrong on one machine — it is correct and");
  console.log("  slightly more convenient. It stops being correct the moment there is a");
  console.log("  SECOND machine, and it also stops being correct after a deploy, a");
  console.log("  restart, a crash, or an autoscaler removing an instance.");
  console.log("\n  Sticky sessions are the usual patch, and they are a patch: they trade");
  console.log("  even load distribution for correctness, and they still fail on restart.");
  console.log("  The stateless version needed no coordination at all — three different");
  console.log("  instances served one paginated walk and none of them knew about the");
  console.log("  others.");
  console.log("\n  Note what statelessness did NOT require: giving up storage. All 25");
  console.log("  items live on the server. RESOURCE state is the point of a server;");
  console.log("  CLIENT CONTEXT — 'where is this particular caller up to' — is what must");
  console.log("  not live there.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — UNIFORM INTERFACE (1): RESOURCES AND REPRESENTATIONS
// ══════════════════════════════════════════════════════════════════
//
// A resource is a concept with an identity. A representation is one
// rendering of it. The URI names the first; Content-Type describes the
// second; and the same resource can have many representations.

async function section5() {
  console.log("\n══ § 5 — one resource, several representations ══\n");

  const order = { id: "ord_7", customer: "ada", total: 42.5, status: "paid" };

  const { server, port } = await listen((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname !== "/orders/ord_7") return json(res, 404, { error: "not found" });

    const accept = req.headers.accept || "application/json";
    if (accept.includes("text/csv")) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("vary", "Accept");                       // the same lesson as 10 §6
      return res.end("id,customer,total,status\n" + Object.values(order).join(",") + "\n");
    }
    if (accept.includes("text/html")) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("vary", "Accept");
      return res.end("<h1>Order " + order.id + "</h1><p>" + order.status + "</p>");
    }
    if (accept.includes("application/xml")) {
      res.statusCode = 406;                                   // honest refusal
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ error: "not acceptable", supported: ["application/json", "text/csv", "text/html"] }));
    }
    res.setHeader("vary", "Accept");
    json(res, 200, order);
  });

  const asJson = await request(port, "/orders/ord_7", { headers: { accept: "application/json" } });
  const asCsv = await request(port, "/orders/ord_7", { headers: { accept: "text/csv" } });
  const asHtml = await request(port, "/orders/ord_7", { headers: { accept: "text/html" } });
  const asXml = await request(port, "/orders/ord_7", { headers: { accept: "application/xml" } });
  server.close();

  results.representations = {
    json: { type: asJson.headers["content-type"], body: asJson.body },
    csv: { type: asCsv.headers["content-type"], body: asCsv.body.split("\n")[1] },
    html: { type: asHtml.headers["content-type"] },
    xml: { status: asXml.status },
    vary: asJson.headers.vary,
  };

  console.log("  URI: /orders/ord_7 — ONE resource\n");
  console.log("    Accept: application/json →", asJson.headers["content-type"]);
  console.log("      " + asJson.body);
  console.log("    Accept: text/csv         →", asCsv.headers["content-type"]);
  console.log("      " + asCsv.body.replace("\n", " / ").trim());
  console.log("    Accept: text/html        →", asHtml.headers["content-type"]);
  console.log("    Accept: application/xml  →", asXml.status, asXml.body);
  console.log("\n  Vary header:", JSON.stringify(results.representations.vary));
  console.log("\n  Three constraints are visible in that one exchange:");
  console.log("   • IDENTIFICATION: the URI names the ORDER, not the JSON. The order is");
  console.log("     the resource; JSON is one way of writing it down. That is why");
  console.log("     /getOrderJson?id=7 is not a resource URI — it names a procedure and");
  console.log("     a format instead of a thing.");
  console.log("   • MANIPULATION THROUGH REPRESENTATIONS: the client changes the order");
  console.log("     by sending back a representation of what it should become, not by");
  console.log("     calling a method on it.");
  console.log("   • SELF-DESCRIPTIVE MESSAGES: Content-Type tells the client how to");
  console.log("     parse the bytes without prior agreement, and 406 is an honest");
  console.log("     'I cannot produce that' rather than silently sending JSON anyway.");
  console.log("\n  And Vary: Accept is not optional here. Without it a shared cache stores");
  console.log("  the CSV under the URL and serves it to the next client that wanted JSON");
  console.log("  — the identical mistake as a missing Vary: Origin in 2B.2 · 10 §6.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — UNIFORM INTERFACE (2): METHOD SEMANTICS ARE A CONTRACT
// ══════════════════════════════════════════════════════════════════
//
// The uniform interface only buys you anything if the methods mean what the
// specification says they mean. Safe = no observable state change.
// Idempotent = doing it N times leaves the same state as doing it once.

async function section6() {
  console.log("\n══ § 6 — safe and idempotent, measured ══\n");

  const db = new Map([["item_001", { id: "item_001", name: "Widget", views: 0 }]]);
  let created = 0;

  const { server, port } = await listen((req, res) => {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean);

    // ✅ GET is SAFE: it does not modify the resource.
    if (req.method === "GET" && parts[0] === "items" && parts[1]) {
      const item = db.get(parts[1]);
      return item ? json(res, 200, item) : json(res, 404, { error: "not found" });
    }
    // 🐛 The classic violation, kept here on purpose.
    if (req.method === "GET" && parts[0] === "unsafe-get" && parts[1]) {
      const item = db.get(parts[1]);
      item.views += 1;                                 // a GET that mutates
      return json(res, 200, item);
    }
    // ✅ PUT is IDEMPOTENT: it sets the resource to the given state.
    if (req.method === "PUT" && parts[0] === "items" && parts[1]) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        const existed = db.has(parts[1]);
        db.set(parts[1], { id: parts[1], name: body.name, views: db.get(parts[1])?.views ?? 0 });
        json(res, existed ? 200 : 201, db.get(parts[1]));
      });
    }
    // ✅ POST is NEITHER: it creates a new subordinate resource each time.
    if (req.method === "POST" && parts[0] === "items") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        created += 1;
        const id = "item_" + String(100 + created);
        db.set(id, { id, name: body.name, views: 0 });
        json(res, 201, db.get(id), { location: "/items/" + id });
      });
    }
    // ✅ DELETE is IDEMPOTENT: gone stays gone.
    if (req.method === "DELETE" && parts[0] === "items" && parts[1]) {
      db.delete(parts[1]);
      res.statusCode = 204;
      return res.end();
    }
    json(res, 405, { error: "method not allowed" }, { allow: "GET, PUT, POST, DELETE" });
  });

  const before = JSON.parse((await request(port, "/items/item_001")).body);
  await request(port, "/items/item_001");
  await request(port, "/items/item_001");
  const afterGets = JSON.parse((await request(port, "/items/item_001")).body);

  await request(port, "/unsafe-get/item_001");
  await request(port, "/unsafe-get/item_001");
  const afterUnsafe = JSON.parse((await request(port, "/items/item_001")).body);

  const put1 = await request(port, "/items/item_555", { method: "PUT", body: { name: "Gadget" } });
  const put2 = await request(port, "/items/item_555", { method: "PUT", body: { name: "Gadget" } });
  const put3 = await request(port, "/items/item_555", { method: "PUT", body: { name: "Gadget" } });
  const sizeAfterPuts = db.size;

  const post1 = await request(port, "/items", { method: "POST", body: { name: "Doohickey" } });
  const post2 = await request(port, "/items", { method: "POST", body: { name: "Doohickey" } });
  const sizeAfterPosts = db.size;

  const del1 = await request(port, "/items/item_555", { method: "DELETE" });
  const del2 = await request(port, "/items/item_555", { method: "DELETE" });

  const patchAttempt = await request(port, "/items/item_001", { method: "PATCH", body: {} });

  server.close();

  results.methods = {
    viewsBefore: before.views,
    viewsAfterThreeGets: afterGets.views,
    viewsAfterUnsafeGets: afterUnsafe.views,
    putStatuses: [put1.status, put2.status, put3.status],
    rowsAfterThreePuts: sizeAfterPuts,
    postStatuses: [post1.status, post2.status],
    postLocations: [post1.headers.location, post2.headers.location],
    rowsAfterTwoPosts: sizeAfterPosts,
    deleteStatuses: [del1.status, del2.status],
    methodNotAllowed: { status: patchAttempt.status, allow: patchAttempt.headers.allow },
  };

  console.log("  SAFE — three GETs of /items/item_001:");
  console.log("    views before:", before.views, " after:", afterGets.views, " ✅ unchanged");
  console.log("  the same handler with a counter increment (a 'safe' GET that isn't):");
  console.log("    views now:", afterUnsafe.views, " 🐛");
  console.log("\n  IDEMPOTENT — three identical PUTs to /items/item_555:");
  console.log("    statuses:", results.methods.putStatuses.join(", "), " (201 then 200, 200)");
  console.log("    rows in the database:", sizeAfterPuts, " ✅ one");
  console.log("\n  NOT IDEMPOTENT — two identical POSTs to /items:");
  console.log("    statuses:", results.methods.postStatuses.join(", "));
  console.log("    Location headers:", results.methods.postLocations.join(", "));
  console.log("    rows in the database:", sizeAfterPosts, " ← two, and correctly so");
  console.log("\n  IDEMPOTENT — two DELETEs of the same resource:");
  console.log("    statuses:", results.methods.deleteStatuses.join(", "), " ✅ both 204");
  console.log("\n  unsupported method →", patchAttempt.status, " Allow:", patchAttempt.headers.allow);
  console.log("\n  Why these words are load-bearing rather than pedantry:");
  console.log("   • SAFE is what lets anything retry, prefetch or cache a GET without");
  console.log("     asking you. A browser prefetcher, a crawler, or a proxy warming a");
  console.log("     cache will hit that view counter — and a GET that deletes something");
  console.log("     WILL eventually be found by a link-checker.");
  console.log("   • IDEMPOTENT is what makes retries safe. A network timeout does not");
  console.log("     tell the client whether the request arrived, so a client that cannot");
  console.log("     retry cannot recover. PUT and DELETE can be retried blindly; POST");
  console.log("     cannot, which is exactly why payment APIs add an idempotency key and");
  console.log("     turn it into one.");
  console.log("   • 405 with an Allow header (2B.2 · 05 §6) is the uniform interface");
  console.log("     answering honestly: the resource exists, the verb does not apply.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — UNIFORM INTERFACE (3): HATEOAS
// ══════════════════════════════════════════════════════════════════
//
// The constraint almost nobody implements, demonstrated so you can argue
// about it from experience rather than from a blog post.

async function section7() {
  console.log("\n══ § 7 — a client that knows only the entry point ══\n");

  const carts = new Map();
  let nextId = 1;

  const { server, port } = await listen((req, res) => {
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/") {
      return json(res, 200, {
        service: "shop",
        _links: { carts: { href: "/carts", method: "POST" } },
      });
    }
    if (parts[0] === "carts" && !parts[1] && req.method === "POST") {
      const id = "cart_" + nextId++;
      carts.set(id, { id, items: [], status: "open" });
      return json(res, 201, cartRepresentation(carts.get(id)), { location: "/carts/" + id });
    }
    if (parts[0] === "carts" && parts[1] && parts.length === 2) {
      const cart = carts.get(parts[1]);
      if (!cart) return json(res, 404, { error: "not found" });
      if (req.method === "GET") return json(res, 200, cartRepresentation(cart));
    }
    if (parts[0] === "carts" && parts[1] && parts[2] === "items" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      return req.on("end", () => {
        const cart = carts.get(parts[1]);
        cart.items.push(JSON.parse(raw || "{}").sku);
        json(res, 200, cartRepresentation(cart));
      });
    }
    if (parts[0] === "carts" && parts[1] && parts[2] === "checkout" && req.method === "POST") {
      const cart = carts.get(parts[1]);
      cart.status = "paid";
      return json(res, 200, cartRepresentation(cart));
    }
    json(res, 404, { error: "not found" });
  });

  // The representation carries the AVAILABLE TRANSITIONS, and they change
  // with the resource's state — which is the actual content of the idea.
  function cartRepresentation(cart) {
    const links = { self: { href: "/carts/" + cart.id, method: "GET" } };
    if (cart.status === "open") {
      links.addItem = { href: "/carts/" + cart.id + "/items", method: "POST" };
      if (cart.items.length > 0) links.checkout = { href: "/carts/" + cart.id + "/checkout", method: "POST" };
    }
    if (cart.status === "paid") links.receipt = { href: "/carts/" + cart.id + "/receipt", method: "GET" };
    return { ...cart, _links: links };
  }

  // A client that hard-codes NOTHING except "/" and the names of transitions.
  const visited = [];
  const availableAtEachStep = [];

  let doc = JSON.parse((await request(port, "/")).body);
  visited.push("/");

  const follow = async (link, body = null) => {
    const r = await request(port, link.href, { method: link.method, body });
    visited.push(link.method + " " + link.href);
    return JSON.parse(r.body);
  };

  doc = await follow(doc._links.carts);
  availableAtEachStep.push(Object.keys(doc._links));

  doc = await follow(doc._links.addItem, { sku: "sku_1" });
  availableAtEachStep.push(Object.keys(doc._links));

  const canCheckoutNow = Boolean(doc._links.checkout);
  doc = await follow(doc._links.checkout);
  availableAtEachStep.push(Object.keys(doc._links));

  const canAddAfterPaying = Boolean(doc._links.addItem);

  server.close();

  results.hateoas = {
    visited,
    availableAtEachStep,
    canCheckoutNow,
    canAddAfterPaying,
    finalStatus: doc.status,
  };

  console.log("  the client hard-codes exactly one URL: \"/\"\n");
  visited.forEach((v, i) => console.log("    " + (i + 1) + ". " + v));
  console.log("\n  transitions offered at each step:");
  availableAtEachStep.forEach((links, i) => console.log("    after step " + (i + 2) + ": " + links.join(", ")));
  console.log("\n  checkout offered on an EMPTY cart:",
              availableAtEachStep[0].includes("checkout"), " ✅ correctly absent");
  console.log("  checkout offered once an item was added:", canCheckoutNow, " ✅");
  console.log("  addItem still offered after payment:", canAddAfterPaying, " ✅ correctly gone");
  console.log("\n  The interesting part is not that URLs were discovered — it is that the");
  console.log("  set of LEGAL ACTIONS came from the server and changed with the");
  console.log("  resource's state. The client never encoded the rule 'you cannot check");
  console.log("  out an empty cart' or 'a paid cart is not editable'. It rendered what");
  console.log("  it was offered.");
  console.log("\n  The honest assessment, which is what an interviewer is actually");
  console.log("  probing for:");
  console.log("   • What it genuinely buys: URL structure stops being a public contract,");
  console.log("     so you can restructure paths without breaking clients; and business");
  console.log("     rules live in one place instead of being duplicated into every");
  console.log("     client's if-statements.");
  console.log("   • What it costs: bigger payloads, more round trips, and clients that");
  console.log("     must be WRITTEN to follow links. A generated client with typed");
  console.log("     methods will hard-code paths anyway, and then you are paying for");
  console.log("     links nobody follows.");
  console.log("   • Where it wins in practice: pagination (`next`), long-running jobs");
  console.log("     (`status`), and workflows where available actions depend on state —");
  console.log("     approvals, orders, refunds. Almost everyone ships those three and");
  console.log("     skips the rest, which is a defensible position as long as you can");
  console.log("     say why.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — CACHEABILITY AND LAYERED SYSTEM: WHAT THE CONSTRAINTS BUY
// ══════════════════════════════════════════════════════════════════
//
// The constraints are not aesthetic. Each one purchases a specific
// operational property, and here are the two easiest to measure.

async function section8() {
  console.log("\n══ § 8 — what a proxy can do without understanding you ══\n");

  let originHits = 0;
  const origin = await listen((req, res) => {
    originHits++;
    if (req.method === "GET" && req.url === "/items/item_001") {
      return json(res, 200, { id: "item_001", name: "Widget" },
        { "cache-control": "public, max-age=60", etag: 'W/"v1"' });
    }
    if (req.method === "POST" && req.url === "/items") {
      return json(res, 201, { id: "item_new" }, { "cache-control": "no-store" });
    }
    json(res, 404, { error: "not found" });
  });

  // A cache that knows NOTHING about items, orders or your domain — only
  // HTTP semantics. That is the layered-system constraint paying off.
  const cache = new Map();
  const proxy = await listen(async (req, res) => {
    const key = req.method + " " + req.url;
    const cacheable = req.method === "GET";
    if (cacheable && cache.has(key)) {
      const hit = cache.get(key);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("x-cache", "HIT");
      return res.end(hit);
    }
    const upstream = await request(origin.port, req.url, { method: req.method, body: req.method === "POST" ? {} : null });
    const cc = upstream.headers["cache-control"] || "";
    if (cacheable && /max-age=[1-9]/.test(cc) && !/no-store/.test(cc)) cache.set(key, upstream.body);
    res.statusCode = upstream.status;
    res.setHeader("content-type", "application/json");
    res.setHeader("x-cache", cacheable ? "MISS" : "BYPASS");
    res.end(upstream.body);
  });

  const gets = [];
  for (let i = 0; i < 5; i++) gets.push((await request(proxy.port, "/items/item_001")).headers["x-cache"]);
  const originAfterGets = originHits;

  const posts = [];
  for (let i = 0; i < 3; i++) posts.push((await request(proxy.port, "/items", { method: "POST", body: {} })).headers["x-cache"]);
  const originAfterPosts = originHits;

  origin.server.close();
  proxy.server.close();

  results.caching = {
    getCacheStates: gets,
    originHitsForFiveGets: originAfterGets,
    postCacheStates: posts,
    originHitsForThreePosts: originAfterPosts - originAfterGets,
  };

  console.log("  five identical GETs through a domain-ignorant proxy:");
  console.log("    cache states:", gets.join(", "));
  console.log("    requests that reached the origin:", originAfterGets, "of 5 ✅");
  console.log("  three POSTs through the same proxy:");
  console.log("    cache states:", posts.join(", "));
  console.log("    requests that reached the origin:", results.caching.originHitsForThreePosts, "of 3 ✅");
  console.log("\n  That proxy contains no knowledge of items. It made a correct caching");
  console.log("  decision from two things: the METHOD (GET is safe, so a response may be");
  console.log("  reused) and the Cache-Control header (self-descriptive message). This");
  console.log("  is the whole payoff of the uniform interface — components you did not");
  console.log("  write, and cannot modify, can participate correctly.");
  console.log("\n  Every constraint buys something specific:");
  console.log("    client-server     → the UI and the data model evolve separately");
  console.log("    stateless         → any instance serves any request (§4)");
  console.log("    cacheable         → a proxy or CDN answers without your origin");
  console.log("    uniform interface → generic components: caches, gateways, browsers");
  console.log("    layered system    → you can insert a CDN, a gateway, a WAF, and no");
  console.log("                        client needs to know");
  console.log("    code on demand    → optional; almost nobody uses it");
  console.log("\n  And the honest costs, which is the answer to 'when would you NOT do");
  console.log("  this?':");
  console.log("   • Statelessness means re-establishing context on every request — auth");
  console.log("     verified every time, no server-side cursor, and often a redundant");
  console.log("     lookup. That is real work traded for scalability.");
  console.log("   • The uniform interface is deliberately generic, so it under-fits");
  console.log("     specific needs: over-fetching, under-fetching, and N+1 round trips");
  console.log("     are the standard REST complaints, and they are what GraphQL and");
  console.log("     tRPC exist to answer (→ 13_graphql-vs-rest.js, 14_trpc-basics.js).");
  console.log("   • Strict resource modelling fights genuinely procedural actions.");
  console.log("     'Send the invoice' is not a noun. Model it as a resource anyway");
  console.log("     (POST /invoices/7/deliveries) or accept a deliberate exception —");
  console.log("     but make it a decision, not an accident.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Pagination that repeats or skips pages under a load balancer,
//   because the cursor lived in one process. → §4
//
// Bug 2 — "It works locally and breaks in production" for anything holding
//   per-client context in memory: wizards, multi-step forms, upload
//   sessions. → §4, 2B.2 · 16 §7
//
// Bug 3 — Sticky sessions adopted as a fix, then uneven load and a broken
//   flow on every deploy. → §4
//
// Bug 4 — A crawler or link-checker deleting records, because a
//   state-changing action was exposed as a GET. → §6
//
// Bug 5 — Double charges: a client retried a POST after a timeout, because
//   POST is not idempotent and there was no idempotency key. → §6
//
// Bug 6 — A view counter incremented by prefetchers and cache warmers,
//   making analytics meaningless. → §6
//
// Bug 7 — A cache serving the CSV representation to a client that asked for
//   JSON, because Vary: Accept was missing. → §5, 2B.2 · 10 §6
//
// Bug 8 — Returning 200 with an error body, so every proxy, retry policy
//   and dashboard believes the request succeeded. → §5, §8
//
// Bug 9 — Clients hard-coding URL structure, so a path rename becomes a
//   breaking change for every consumer. → §7
//
// Bug 10 — Business rules duplicated into every client ("disable checkout
//   when the cart is empty"), drifting out of sync. → §7
//
// Bug 11 — POST used for reads, making every response uncacheable and every
//   retry unsafe. → §6, §8
//
// Bug 12 — RPC in REST clothing: /api/getUserById, /api/updateUserV2 — no
//   resources, no method semantics, so nothing generic can help you. → §5


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — statelessness:
  assert.deepEqual(results.statefulPinned, ["item_001", "item_006", "item_011"],
    "the stateful cursor advanced correctly while the client stayed on one instance ✅");
  assert.ok(results.statefulDuplicates > 0,
    "…and repeated pages the moment the same client was load balanced 🐛 (" +
    results.statefulDuplicates + " duplicates in 6 requests)");
  assert.equal(results.statelessWalked.length, 25,
    "the stateless walk collected every item ✅");
  assert.equal(results.statelessUnique, 25, "…with no duplicates and no gaps ✅");
  assert.ok(results.statelessInstancesUsed >= 2,
    "…while being served by " + results.statelessInstancesUsed + " different instances ✅");

  // § 5 — representations:
  const rep = results.representations;
  assert.ok(rep.json.type.startsWith("application/json"));
  assert.deepEqual(JSON.parse(rep.json.body), { id: "ord_7", customer: "ada", total: 42.5, status: "paid" });
  assert.ok(rep.csv.type.startsWith("text/csv"),
    "the SAME URI produced a CSV representation for a different Accept header ✅");
  assert.equal(rep.csv.body, "ord_7,ada,42.5,paid", "…carrying the same resource state");
  assert.ok(rep.html.type.startsWith("text/html"), "…and an HTML one ✅");
  assert.equal(rep.xml.status, 406,
    "…while an unsupported type was refused with 406 rather than silently sent as JSON ✅");
  assert.equal(rep.vary, "Accept",
    "…and Vary: Accept stopped a shared cache serving one representation for another ✅");

  // § 6 — method semantics:
  const m = results.methods;
  assert.equal(m.viewsBefore, 0);
  assert.equal(m.viewsAfterThreeGets, 0, "three GETs changed nothing — GET is SAFE ✅");
  assert.equal(m.viewsAfterUnsafeGets, 2,
    "…while a GET that increments a counter changed state twice 🐛 — unsafe, and every " +
    "prefetcher and crawler will trigger it");
  assert.deepEqual(m.putStatuses, [201, 200, 200],
    "PUT created once then updated — 201 then 200 ✅");
  assert.equal(m.rowsAfterThreePuts, 2,
    "…and three identical PUTs left ONE new row: idempotent ✅");
  assert.deepEqual(m.postStatuses, [201, 201]);
  assert.notEqual(m.postLocations[0], m.postLocations[1],
    "two identical POSTs created two DIFFERENT resources — not idempotent, by design ✅");
  assert.equal(m.rowsAfterTwoPosts, 4, "…so the row count grew by two");
  assert.deepEqual(m.deleteStatuses, [204, 204],
    "DELETE twice returned 204 both times — idempotent ✅");
  assert.equal(m.methodNotAllowed.status, 405);
  assert.equal(m.methodNotAllowed.allow, "GET, PUT, POST, DELETE",
    "…and an unsupported method got 405 with Allow, not 404 ✅");

  // § 7 — HATEOAS:
  const h = results.hateoas;
  assert.deepEqual(h.visited[0], "/", "the client started from the entry point only");
  assert.equal(h.visited.length, 4, "…and completed a four-step workflow by following links ✅");
  assert.deepEqual(h.availableAtEachStep[0], ["self", "addItem"],
    "an EMPTY cart offered no checkout link — the rule came from the server ✅");
  assert.deepEqual(h.availableAtEachStep[1], ["self", "addItem", "checkout"],
    "…and checkout appeared once an item existed ✅");
  assert.equal(h.canCheckoutNow, true);
  assert.deepEqual(h.availableAtEachStep[2], ["self", "receipt"],
    "…while a PAID cart offered a receipt and no longer offered editing ✅");
  assert.equal(h.canAddAfterPaying, false, "…so the client could not offer an illegal action");
  assert.equal(h.finalStatus, "paid");

  // § 8 — cacheability and layering:
  const c = results.caching;
  assert.deepEqual(c.getCacheStates, ["MISS", "HIT", "HIT", "HIT", "HIT"],
    "a domain-ignorant proxy cached a safe, cacheable GET ✅");
  assert.equal(c.originHitsForFiveGets, 1,
    "…so five client requests reached the origin once ✅");
  assert.deepEqual(c.postCacheStates, ["BYPASS", "BYPASS", "BYPASS"],
    "…and correctly refused to cache POSTs ✅");
  assert.equal(c.originHitsForThreePosts, 3, "…every one of which reached the origin ✅");

  console.log("§10 — mini assertions passed for: REST principles (stateless, uniform interface)");
  console.log("\n  The pair that captures it: a paginated walk served correctly by three");
  console.log("  different instances that knew nothing about each other — and a proxy");
  console.log("  with no knowledge of the domain cutting five requests to one, purely");
  console.log("  from the method and a header.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what makes an API RESTful?", answer:
//
//   "REST is a set of architectural constraints, and each one buys a
//    specific property. The two that decide whether a system actually
//    behaves like one are statelessness and the uniform interface.
//
//    Statelessness is the one people define wrongly. It doesn't mean no
//    state — the server holds all the resource state it likes, that's what
//    a database is for. It means no CLIENT CONTEXT between requests: every
//    request has to be understandable on its own. The test I use is
//    concrete: pagination where the cursor lives in server memory works
//    perfectly on one machine, and starts repeating and skipping pages the
//    moment a load balancer sends the same client to a different instance —
//    and it breaks on every deploy too. Put the cursor in the URL the
//    server hands back and three instances can serve one paginated walk
//    without knowing about each other. Sticky sessions are a patch that
//    trades even load for correctness and still fails on restart. Worth
//    noting a session cookie isn't a violation: the request carries the id,
//    and any instance resolves it from a shared store.
//
//    The uniform interface is four constraints. Resources are identified by
//    URIs — the URI names the order, not the JSON, which is why
//    /getOrderJson?id=7 isn't a resource. You manipulate through
//    representations, so the same URI can return JSON or CSV based on
//    Accept — and that needs Vary: Accept, or a shared cache serves one
//    client's CSV to the next. Messages are self-descriptive: Content-Type,
//    honest status codes, and correct method semantics. Safe means a GET
//    changes nothing, which is what lets prefetchers and crawlers hit it
//    freely — a GET that deletes will eventually be found by a
//    link-checker. Idempotent means retrying is safe, which matters because
//    a timeout never tells the client whether the request arrived; PUT and
//    DELETE can be retried blindly, POST can't, which is exactly why
//    payment APIs bolt on an idempotency key.
//
//    The fourth is HATEOAS, and I'd be honest that almost nobody implements
//    it fully. What it genuinely buys is that URL structure stops being a
//    public contract, and that state-dependent rules — you can't check out
//    an empty cart — live on the server instead of being duplicated into
//    every client. Most teams ship the useful 20%: next links for
//    pagination, status links for long-running jobs, action links in
//    workflows.
//
//    And the payoff for all of it is generic components. I can put a cache
//    in front that knows nothing about my domain, and it makes correct
//    decisions from the method and Cache-Control alone — five identical
//    GETs reaching the origin once, POSTs never cached. That's why the
//    constraints are worth holding: not purity, but that infrastructure you
//    didn't write can participate."
//
// The pagination demo is the thing to reach for. It converts "stateless"
// from a word into an operational failure you have seen.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does stateless mean the server stores nothing?
// A1. No. It stores resource state; it holds no per-client context between
//     requests (§4).
//
// Q2. Are sessions a violation of REST?
// A2. Strictly, server-side session context is. In practice a session id
//     resolved from a SHARED store keeps every operational property that
//     matters; per-process memory does not (§4, 2B.2 · 16 §7).
//
// Q3. What breaks first when you scale a stateful API?
// A3. Anything holding per-client progress: pagination cursors, wizards,
//     multi-step uploads (§4).
//
// Q4. What are sticky sessions really costing you?
// A4. Even load distribution, and they still fail on restart or rescale
//     (§4).
//
// Q5. What are the four parts of the uniform interface?
// A5. Resource identification; manipulation through representations;
//     self-descriptive messages; hypermedia as the engine of application
//     state (§5-§7).
//
// Q6. Resource vs representation?
// A6. The resource is the concept the URI names; a representation is one
//     rendering of it, described by Content-Type (§5).
//
// Q7. Why does content negotiation need Vary?
// A7. Otherwise a shared cache stores one representation under the URL and
//     serves it to clients that asked for another (§5).
//
// Q8. Define safe and idempotent, and give the practical consequence.
// A8. Safe = no observable state change, so anything may retry or prefetch
//     it. Idempotent = N times equals once, so a client can retry after a
//     timeout (§6).
//
// Q9. Is POST ever idempotent?
// A9. Not by default. An idempotency key plus server-side deduplication
//     makes it so, which is what payment APIs do (§6).
//
// Q10. Is PATCH idempotent?
// A10. It depends on the patch document. Setting a field is; "increment by
//      one" is not. That is a design decision you make, not a given.
//
// Q11. Why 405 with Allow rather than 404?
// A11. The resource exists; the method does not apply. A 404 tells the
//      client the wrong thing (§6, 2B.2 · 05 §6).
//
// Q12. What does HATEOAS actually buy?
// A12. URL structure stops being a contract, and state-dependent rules live
//      server-side instead of in every client (§7).
//
// Q13. Why does almost nobody implement it?
// A13. Payload size, extra round trips, and clients written against
//      generated types that hard-code paths regardless (§7).
//
// Q14. What is the layered-system constraint worth?
// A14. You can insert a CDN, gateway or WAF and no client needs to know —
//      demonstrated by a cache that knows nothing about the domain (§8).
//
// Q15. When would you NOT choose REST?
// A15. When clients need to shape their own queries (GraphQL), when you
//      control both ends and want typed calls (tRPC or gRPC), or when the
//      domain is genuinely event-driven rather than resource-shaped
//      (→ 13, 14).
//
// Q16. Is your API RESTful if it ignores HATEOAS?
// A16. By Fielding's definition, no. In industry usage it is called REST
//      anyway. The useful answer names the constraints you hold and the
//      one you dropped, with the reason.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does stateless actually forbid?
//   Back : Per-client context on the server between requests. Not storage.
//
// Flashcard 2:
//   Front: The one-line test?
//   Back : Can a different instance serve the next request correctly?
//
// Flashcard 3:
//   Front: Four parts of the uniform interface?
//   Back : URIs · representations · self-descriptive messages · HATEOAS.
//
// Flashcard 4:
//   Front: Resource vs representation?
//   Back : The thing vs one rendering of it (JSON, CSV, HTML).
//
// Flashcard 5:
//   Front: Why Vary: Accept?
//   Back : Or a cache serves the CSV to a client that wanted JSON.
//
// Flashcard 6:
//   Front: Safe means?
//   Back : No observable state change. Prefetchers may hit it freely.
//
// Flashcard 7:
//   Front: Idempotent means?
//   Back : N times == once. This is what makes retry-after-timeout safe.
//
// Flashcard 8:
//   Front: Which methods are which?
//   Back : GET/HEAD safe+idempotent · PUT/DELETE idempotent · POST neither.
//
// Flashcard 9:
//   Front: Making POST retry-safe?
//   Back : An idempotency key plus server-side dedup.
//
// Flashcard 10:
//   Front: What does HATEOAS buy?
//   Back : URLs stop being a contract; state rules live server-side.
//
// Flashcard 11:
//   Front: How do you sound senior?
//   Back : "Stateless isn't 'no state' — it's 'no client context'. Here's a
//          cursor that proves the difference under a load balancer."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Convert §4's stateful instance to a shared store and re-run the
//   load-balanced walk. Does it work? Is it stateless now — and what
//   property did you actually restore?
//
// Task 2:
//   Add an ETag to §5's JSON representation and prove a conditional GET
//   returns 304 (2B.2 · 08 §7). Which constraint did you just satisfy?
//
// Task 3:
//   Implement an Idempotency-Key header on §6's POST: same key returns the
//   same created resource with no second row.
//
// Task 4:
//   Break §6 on purpose — expose DELETE as GET /items/1/delete — then write
//   the crawler that destroys the database in three lines.
//
// Task 5:
//   Extend §7's cart with a "cancel" transition that only appears for
//   unpaid carts, and write a client that never checks status directly.
//
// Task 6:
//   Remove Vary: Accept from §5, put a shared cache in front, and reproduce
//   the wrong-representation bug.
//
// Task 7:
//   Add Cache-Control: private to a user-specific response in §8 and show
//   the shared proxy declining to cache it. Why does that distinction
//   matter more than max-age?
//
// Task 8:
//   Take a real endpoint you have written that is RPC-shaped and redesign
//   it as resources. Write down what got better and what got worse — the
//   second list is the honest part.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Stateless forbids CLIENT CONTEXT on the server, not storage — and the
//   test is whether a different instance can serve the next request
//   correctly.
//
// If you remember the common bug:
//   A pagination cursor in process memory: correct on one machine, and
//   silently repeating or skipping pages behind a load balancer.
//
// If you remember the professional framing:
//   Resources named by URIs, representations negotiated with Accept and
//   Vary, honest methods and status codes, links for pagination and
//   state-dependent actions — so that caches, gateways and clients you did
//   not write can participate correctly.
//
// ─────────────────────────────────────────────────────────────────
// This file used GET, POST, PUT and DELETE as though their meanings were
// settled, and asserted that PUT is idempotent and POST is not. The next
// file takes each method in turn — including PATCH, HEAD and OPTIONS — and
// establishes exactly what each one promises, what it may carry, and where
// the specification is more subtle than the summary.
//
// NEXT TOPIC -> 02_http-methods-get-post-put-patch-delete.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
