// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  08_cluster-module.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Cluster module
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: CLUSTER IS fork() FOR
//      SERVERS — N worker PROCESSES, ONE listening port, shared by the OS
//   2. Requests round-robin across workers — proven by hammering one server
//      and collecting which PID answered each request
//   3. Workers share NO memory — an in-process counter in one worker is
//      invisible to the next, proven the same way
//   4. A crashed worker does not take the server down, and the standard
//      production pattern — respawn on 'exit' — measured live
//   5. The actual payoff: real CPU-bound throughput, single process vs a
//      4-worker cluster on the same machine
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/08_cluster-module.js"
//
// Prerequisites: 07_child-process.js (cluster.fork() IS child_process.fork()
// underneath, with one extra trick: shared listening sockets) and
// 06_worker-threads.js (the contrast — cluster scales SERVERS across cores;
// workers scale CPU-bound FUNCTIONS within one process).
//
// 07 ended by saying fork() is expensive to start but buys full process
// isolation. Cluster is the case where that trade is obviously worth it: an
// HTTP server is exactly the kind of long-lived thing you start once and run
// for days, so paying fork()'s startup cost once, per core, at boot is free
// in practice — and in exchange every request handler crash is contained to
// one of N processes instead of the whole server.


const cluster = require("cluster");
const http = require("http");

const PORT = 9,               // placeholder, replaced below with a real free port
      TOTAL = 16;

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// cluster:
// A Node module that forks N copies of the CURRENT script as full child
// processes, has them all call .listen() on the SAME port, and lets the OS
// (or Node's own round-robin scheduler) hand each incoming connection to a
// different one — turning one Node process's one core into N processes
// across N cores.
//
// If interviewer says "explain it simply", say:
//   "It's child_process.fork() applied to the specific problem of 'my server
//    only uses one CPU core'. You fork one worker per core, they all bind
//    the same port — which sounds impossible until you know the OS lets
//    multiple processes share a listening socket — and requests get spread
//    across them."
//
// If interviewer says "why not just use Worker Threads for this?", say:
//   "You could run the server inside each worker thread instead, and it
//    would also use multiple cores. Cluster's actual advantage is the
//    process boundary: a worker CRASHING, leaking memory, or getting stuck
//    only takes out 1/N of your capacity, and you can restart it without
//    restarting the others. That's a much stronger guarantee than a thread
//    crash gives you."
//
// Why it matters in interviews:
//   This is the "how do you use all your CPU cores in Node" question, and
//   the correct senior answer names the actual payoff (crash isolation, not
//   just parallelism) and the actual cost (N full processes, N times the
//   base memory, no shared in-memory cache between them).


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE PORT, MANY PROCESSES, ZERO SHARED MEMORY.
//
// Runtime rule:
//   The PRIMARY process calls cluster.fork() N times. Each fork is a real
//   child_process.fork() — a whole new Node process (07 §6). When a WORKER
//   calls server.listen(port), cluster intercepts it: the primary actually
//   owns the listening socket, and on Linux/most platforms hands each new
//   connection to one worker round-robin (SCHED_RR, the default everywhere
//   except Windows). The worker never sees "sharing" — .listen() just works,
//   and cluster is the machinery making that true.
//
// Practical rule:
//   Anything in memory in one worker — a cache, an in-memory session store, a
//   rate-limit counter, an in-flight WebSocket connection — exists ONLY in
//   that worker. Two requests from the same user can land on two different
//   workers with two different answers. State that must be shared goes in
//   Redis, a database, or another out-of-process store — never a module-level
//   variable.
//
// Common trap:
//   Assuming cluster gives you more THROUGHPUT PER REQUEST. It does not — one
//   request is still handled by one process, on one core, at normal speed.
//   What scales is CONCURRENT requests: N processes can each be doing CPU
//   work at the same time. §6 measures exactly that gain, and it is real but
//   it is not infinite — process count still tops out at core count.
//
// The mental picture:
//
//                         PRIMARY process
//                    (owns the listening socket)
//                              │
//              round-robins each new connection
//        ┌──────────┬──────────┬──────────┬──────────┐
//        ▼          ▼          ▼          ▼
//   worker 1    worker 2    worker 3    worker 4
//   (own heap)  (own heap)  (own heap)  (own heap)
//   (own event  (own event  (own event  (own event
//    loop)       loop)       loop)       loop)
//
//   Every worker here is exactly what 07 §5-§7 described: a full fork()'d
//   process, with an IPC channel back to the primary that cluster uses
//   internally to hand off connections. You get that for free; you do not
//   write the IPC yourself.


// ── a real free port, so this file never collides with anything running ──
const net = require("net");

function getFreePort() {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// PRIMARY PROCESS — everything below only runs in the process that
// started this file directly
// ══════════════════════════════════════════════════════════════════

// The §6 baseline forks a PLAIN child (child_process.fork, not cluster.fork)
// to run one ordinary, non-clustered server for comparison. That child
// re-executes this ENTIRE file from the top in a new process — and because
// it was never started via cluster.fork(), cluster.isPrimary is TRUE for it
// too. This check has to come first, or that child re-runs the whole demo
// as its own primary. → 06's "every worker re-runs the file" note, same idea.
if (process.argv.includes("--single-server-child")) {

  (function singleServerChild() {
    function cpuWorkChild() {
      let x = 0;
      for (let i = 0; i < 25_000_000; i++) x += Math.sqrt(i);
      return x;
    }
    http.createServer((req, res) => {
      cpuWorkChild();
      res.end(String(process.pid));
    }).listen(Number(process.env.PORT), () => process.send("ready"));
  })();

} else if (cluster.isPrimary) {

const results = {};

// Killing a worker is ASYNCHRONOUS: .kill() sends the signal, but the OS-level
// 'exit' event arrives a little later. Resolving a section's promise before
// that event lands lets the NEXT section's fresh listeners catch a PREVIOUS
// section's stragglers — a real race, not a hypothetical one. This helper
// waits for every current worker to actually be gone before moving on.
function killAllWorkersAndWait() {
  const workers = Object.values(cluster.workers);
  return Promise.all(workers.map(w => new Promise(res => {
    w.once("exit", () => res());
    w.process.kill();
  })));
}

// ── § 3 — round-robin: hammer one server, collect who actually answered ──

function section3(port) {
  return new Promise(resolve => {
    cluster.removeAllListeners("online");
    cluster.removeAllListeners("exit");
    console.log("§3 — 4 workers, one port, and who really answers 16 requests:\n");

    const N = 4;
    for (let i = 0; i < N; i++) cluster.fork({ WORKER_MODE: "roundrobin", PORT: port });

    let online = 0;
    cluster.on("online", () => {
      if (++online === N) setTimeout(fire, 250);   // give every .listen() a moment to bind
    });

    function fire() {
      const pids = [];
      let done = 0;
      for (let i = 0; i < TOTAL; i++) {
        http.get(`http://127.0.0.1:${port}/`, res => {
          let body = "";
          res.on("data", d => (body += d));
          res.on("end", () => {
            pids.push(body.trim());
            if (++done === TOTAL) finish();
          });
        });
      }

      async function finish() {
        const unique = new Set(pids);
        console.log("      " + TOTAL + " requests, PIDs that answered, in order:");
        console.log("       ", pids.join(", "));
        console.log("      unique workers used:", unique.size, "of", N, unique.size > 1 ? "✅ round-robin, not one worker doing everything" : "🐛");
        console.log("\n      Nobody wrote a load balancer. `server.listen(port)` inside EVERY");
        console.log("      worker just works, because cluster intercepts the call in the");
        console.log("      worker and hands the real socket ownership to the primary.\n");

        await killAllWorkersAndWait();
        results.uniqueWorkers = unique.size;
        results.workerCount = N;
        resolve();
      }
    }
  });
}

// ── § 4 — no shared memory: each worker's counter is its own ──

function section4(port) {
  return new Promise(resolve => {
    cluster.removeAllListeners("online");
    cluster.removeAllListeners("exit");
    console.log("§4 — an in-memory counter, hit by 6 requests, split across 2 workers:\n");

    const N = 2;
    for (let i = 0; i < N; i++) cluster.fork({ WORKER_MODE: "counter", PORT: port });

    let online = 0;
    cluster.on("online", () => { if (++online === N) setTimeout(fire, 250); });

    function fire() {
      const seen = [];
      let done = 0;
      (function next() {
        if (done === 6) return finish();
        http.get(`http://127.0.0.1:${port}/`, res => {
          let body = "";
          res.on("data", d => (body += d));
          res.on("end", () => { seen.push(body.trim()); done++; next(); });
        });
      })();

      async function finish() {
        seen.forEach(l => console.log("      " + l));

        const counters = seen.map(l => Number(l.match(/counter=(\d+)/)[1]));
        const maxCounter = Math.max(...counters);
        const pids = new Set(seen.map(l => l.match(/pid=(\d+)/)[1]));

        console.log("\n      highest counter value seen:", maxCounter, "— NOT 6, even though 6 requests hit the server");
        console.log("      distinct worker PIDs        :", pids.size);
        console.log("      → each worker started its OWN `let counter = 0` at module scope.");
        console.log("      There is no single number anywhere that reached 6. If this were a");
        console.log("      rate limiter, it would let through roughly N× the real limit — a");
        console.log("      genuine production bug, not a hypothetical one.\n");

        await killAllWorkersAndWait();
        results.maxCounterSeen = maxCounter;
        results.counterWorkers = pids.size;
        resolve();
      }
    }
  });
}

// ── § 5 — crash isolation, and the standard respawn pattern ──

function section5(port) {
  return new Promise(resolve => {
    console.log("§5 — kill one worker mid-flight. The server as a whole does not go down:\n");

    // Every listener below is attached to a SPECIFIC worker object, not the
    // shared `cluster` emitter — so nothing here can leak into, or be leaked
    // into by, any other section. That was the actual bug the first version
    // of this file had: a global cluster.on('exit', …) that outlived its
    // section and caught a LATER section's kills.
    const N = 2;
    const workers = Array.from({ length: N }, () => cluster.fork({ WORKER_MODE: "roundrobin", PORT: port }));

    let onlineCount = 0;
    for (const w of workers) w.once("online", () => { if (++onlineCount === N) setTimeout(killOne, 250); });

    function killOne() {
      const victim = workers[0];
      victim.once("exit", (code, signal) => {
        console.log("      worker", victim.process.pid, "died — code:", code, " signal:", signal);
        const replacement = cluster.fork({ WORKER_MODE: "roundrobin", PORT: port });
        replacement.once("online", () => {
          console.log("      replacement worker", replacement.process.pid, "is online — this is the");
          console.log("      standard production pattern: listen for 'exit', fork a new one.");
          verifyStillServing(victim.process.pid, replacement.process.pid);
        });
      });
      victim.process.kill("SIGKILL");   // simulate a real crash, not a clean exit
    }

    async function verifyStillServing(killedPid, replacementPid) {
      http.get(`http://127.0.0.1:${port}/`, res => {
        let body = "";
        res.on("data", d => (body += d));
        res.on("end", async () => {
          console.log("      a request placed AFTER the crash still got an answer:", JSON.stringify(body.trim()), "✅");
          console.log("      (it went to whichever worker was still up, or the replacement —");
          console.log("       either way, the SERVER never went down for a single request.)\n");
          await killAllWorkersAndWait();
          results.killedPid = killedPid;
          results.replacementPid = replacementPid;
          results.stillServing = body.trim().length > 0;
          resolve();
        });
      });
    }
  });
}

// ── § 6 — the actual payoff: real throughput on CPU-bound requests ──

function section6(port) {
  return new Promise(resolve => {
    cluster.removeAllListeners("online");
    cluster.removeAllListeners("exit");
    console.log("§6 — 16 genuinely CPU-heavy requests: 1 process vs 4:\n");

    function runSingle() {
      return new Promise(res => {
        const { fork } = require("child_process");
        const child = fork(__filename, ["--single-server-child"], { env: { ...process.env, PORT: port } });
        child.on("message", (msg) => { if (msg === "ready") sendLoad(res, port, "single", () => child.kill()); });
      });
    }

    function runCluster() {
      return new Promise(res => {
        const N = 4;
        const workers = Array.from({ length: N }, () => cluster.fork({ WORKER_MODE: "cpu", PORT: port }));
        let online = 0;
        for (const w of workers) w.once("online", () => {
          if (++online === N) setTimeout(() => sendLoad(res, port, "cluster (4 workers)", killAllWorkersAndWait), 300);
        });
      });
    }

    function sendLoad(done, port, label, cleanup) {
      let finished = 0;
      const t0 = Date.now();
      for (let i = 0; i < TOTAL; i++) {
        http.get(`http://127.0.0.1:${port}/`, res => {
          res.resume();
          res.on("end", async () => {
            if (++finished === TOTAL) {
              const ms = Date.now() - t0;
              console.log("      " + label.padEnd(22), ms, "ms for", TOTAL, "CPU-bound requests");
              await cleanup();
              done(ms);
            }
          });
        });
      }
    }

    (async () => {
      const singleMs = await runSingle();
      const clusterMs = await runCluster();
      const speedup = singleMs / clusterMs;

      console.log("\n      speedup:", speedup.toFixed(2) + "×",
        speedup > 1.3 ? "✅ real work happened concurrently across processes" : "(few cores on this machine)");
      console.log("      Nothing here is free: 4 workers means roughly 4× the base memory");
      console.log("      footprint (each is a full Node process, 07 §6) — this trades RAM");
      console.log("      for concurrent CPU capacity, and tops out at your core count.\n");

      results.singleMs = singleMs;
      results.clusterMs = clusterMs;
      resolve();
    })();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT CLUSTER DOES NOT GIVE YOU
// ══════════════════════════════════════════════════════════════════
//
//   ❌ shared memory / a shared cache          → §4. Use Redis or similar.
//   ❌ sticky sessions by default               → the SAME client can land on a
//                                                 DIFFERENT worker every request.
//                                                 Needed for in-memory sessions;
//                                                 solved with a sticky-session
//                                                 module or, better, external
//                                                 session storage.
//   ❌ zero-downtime deploys, automatically      → you still write the "kill one
//                                                 worker, wait for drain, fork a
//                                                 replacement, repeat" logic
//                                                 yourself (§5's pattern, looped).
//   ❌ more than core-count workers helping      → beyond os.cpus().length you are
//                                                 just adding context-switch
//                                                 overhead, not throughput.
//   ❌ a fix for a slow event loop in ONE        → a request that blocks worker 3's
//     worker                                    loop still blocks every request
//                                                 THAT worker was given, for as
//                                                 long as it blocks. Cluster
//                                                 isolates crashes, not slowness.
//
// The honest one-line summary: cluster buys you core-count concurrency and
// crash isolation. Everything about SHARING state across that boundary is
// still your problem, same as any distributed system.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A rate limiter or login-attempt counter that lets through N× the
//   intended limit: module-level state, N workers, N independent counters.
//   → §4. Fix: Redis, or a shared external store.
//
// Bug 2 — WebSocket connections that randomly "lose" messages meant for a
//   specific user: the user's two tabs connected to two different workers,
//   and a server-side broadcast only reached the worker that received it.
//   Fix: a pub/sub layer (Redis, etc.) that all workers subscribe to.
//
// Bug 3 — An in-memory cache with a suspiciously low hit rate:
//   N separate caches, one per worker, each starting cold and never seeing
//   the others' writes.
//
// Bug 4 — "It works with 1 worker and breaks with 4":
//   Any of the above. The fastest diagnostic is literally to set the worker
//   count to 1 and see if the bug disappears.
//
// Bug 5 — Memory usage that looks like a leak but is just N processes:
//   4 workers means roughly 4× one process's baseline RSS, by design — not a
//   leak, just cluster doing what it says.
//
// Bug 6 — A deploy that drops in-flight requests:
//   Killing workers without waiting for `worker.disconnect()` to drain
//   existing connections first. → §7.
//
// Bug 7 — Session cookies that "work sometimes":
//   in-memory sessions with no sticky-session strategy — same bug family as
//   Bug 2, more common because session middleware defaults to memory.
//
// Bug 8 — A cluster that doesn't respawn crashed workers, silently running
//   at reduced capacity for days: no 'exit' handler at all, or one that
//   doesn't call cluster.fork() again. → §5's pattern is the minimum.
//
// Bug 9 — Assuming cluster.fork() is cheap because Worker Threads are:
//   it's child_process.fork() underneath — the 07 §6 cost applies here too,
//   just paid once at boot instead of per-task.
//
// Bug 10 — Load "balancing" that is wildly uneven under real traffic:
//   SCHED_RR is round-robin over CONNECTIONS, not requests, and long-lived
//   keep-alive connections pin a client to one worker for the connection's
//   whole lifetime — very different from evenly splitting request COUNT.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  assert(results.uniqueWorkers > 1,
    "16 requests to one port were answered by MORE THAN ONE worker PID — real round-robin ✅");
  assert(results.uniqueWorkers <= results.workerCount,
    "…and never by more workers than actually exist");

  assert(results.maxCounterSeen < 6,
    "the highest per-worker counter value seen was under 6, even though 6 requests hit the server 🐛");
  assert(results.counterWorkers > 1,
    "…because more than one worker's OWN counter answered some of those requests");

  assert(results.stillServing === true,
    "a request placed right after a SIGKILL'd worker still got a real answer ✅");
  assert(results.killedPid !== results.replacementPid,
    "…served by a genuinely different PID than the one that just died");

  assert(results.singleMs > 0 && results.clusterMs > 0, "both throughput variants were genuinely timed");
  assert(results.clusterMs < results.singleMs,
    "4 workers finished the same CPU-bound request batch faster than 1 process 🐛→✅");

  console.log("§9 — mini assertions passed for: Cluster module");
  console.log("\n  The pair that captures it:", results.uniqueWorkers, "different worker PIDs answered 16 identical");
  console.log("  requests to ONE port with no load balancer written by hand, while the");
  console.log("  SAME requests against a per-worker counter never once reached 6 — because");
  console.log("  round-robin and 'no shared memory' are the same design decision, seen");
  console.log("  from two different angles.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the cluster module and when do you use it?", answer:
//
//   "cluster is child_process.fork() applied specifically to servers. You
//    fork one worker process per CPU core, every worker calls
//    server.listen(port) on the SAME port, and cluster's primary process
//    round-robins each new connection across them. I've proven that directly
//    — 16 requests to one port came back with more than one distinct worker
//    PID in the response body, with zero load-balancing code of my own.
//
//    The actual payoff isn't raw speed on one request — a single request is
//    still handled by one process at normal speed. It's concurrent capacity
//    and crash isolation. I measured 16 genuinely CPU-heavy requests running
//    noticeably faster across 4 workers than in 1 process, because 4 requests
//    can now be doing real CPU work on 4 cores at once. And when I SIGKILL a
//    worker mid-flight, the server as a whole keeps answering requests — the
//    standard pattern is listening for cluster's 'exit' event and forking a
//    replacement, which is maybe five lines of code for a real self-healing
//    server.
//
//    The cost people underestimate is that workers share NOTHING. I proved
//    that too: an in-memory counter split across two workers never reaches
//    the total request count, because each worker has its own independent
//    copy. That's not a bug in cluster, it's the whole design — but it means
//    rate limiters, sessions, and caches built on a plain module-level
//    variable silently misbehave the moment you add a second worker. Anything
//    that needs to be shared has to live outside the process, in Redis or a
//    database or a pub/sub layer.
//
//    So the decision is: use cluster when you want to use every core for a
//    long-lived server and can tolerate — or already handle — state living
//    outside the process. Use Worker Threads instead when the parallelism you
//    need is a specific CPU-bound function, not the whole server."
//
// Leading with "fork() for servers" and proving both the round-robin and the
// no-shared-state claims with real requests is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is cluster built on top of?
// A1. child_process.fork() — one full Node process per worker.
//
// Q2. How do multiple processes share one listening port?
// A2. The primary owns the actual listening socket; workers' .listen() calls
//     are intercepted by cluster and hooked into the primary's round-robin
//     distribution (SCHED_RR by default on most platforms).
//
// Q3. Do workers share memory?
// A3. No — separate processes, separate everything. A module-level variable
//     is one PER WORKER.
//
// Q4. What's the standard pattern for surviving a worker crash?
// A4. Listen for cluster's 'exit' event and call cluster.fork() again to
//     replace it.
//
// Q5. Does cluster speed up a single request?
// A5. No — one request is handled by one worker at normal speed. It
//     increases how many requests can be handled CONCURRENTLY.
//
// Q6. How many workers should you run?
// A6. Roughly os.cpus().length. More adds context-switching, not throughput.
//
// Q7. What state-sharing bugs does cluster commonly cause?
// A7. Rate limiters and login-attempt counters that allow N× the intended
//     limit, in-memory caches with a low hit rate, and WebSocket broadcasts
//     that miss users connected to a different worker.
//
// Q8. What's a "sticky session" and why would you need one?
// A8. Routing so the SAME client always reaches the SAME worker — needed if
//     you keep any per-client state in a worker's memory (in-memory
//     sessions, in-memory WebSocket state) instead of an external store.
//
// Q9. Cluster vs Worker Threads — how do you choose?
// A9. Cluster scales a whole SERVER across cores with process-level crash
//     isolation. Worker Threads scale a specific CPU-bound FUNCTION inside
//     one process, more cheaply, without that isolation.
//
// Q10. Does cluster fix a slow request handler?
// A10. No — it isolates CRASHES, not slowness. A blocking handler in one
//      worker still blocks every request routed to that worker for as long
//      as it blocks.
//
// Q11. What does killing a worker with SIGKILL vs worker.disconnect() do
//      differently?
// A11. SIGKILL is immediate and drops any in-flight requests on that worker.
//      disconnect() lets the worker finish handling its current connections
//      before exiting — the graceful-deploy pattern.
//
// Q12. Is cluster.fork() expensive?
// A12. Yes, per 07 §6 — it's a full Node process each time. In practice this
//      cost is paid once at boot, not per-request, which is why it's an
//      acceptable trade for a long-lived server.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is cluster, structurally?
//   Back : child_process.fork(), N times, all workers sharing one listening
//          port via the primary.
//
// Flashcard 2:
//   Front: How does one port serve N processes?
//   Back : The primary owns the real socket; cluster round-robins each new
//          connection to a worker.
//
// Flashcard 3:
//   Front: Do cluster workers share memory?
//   Back : No — separate processes, separate everything. Proven: a counter
//          split across workers never reaches the true total.
//
// Flashcard 4:
//   Front: Standard crash-recovery pattern?
//   Back : Listen for 'exit', call cluster.fork() again.
//
// Flashcard 5:
//   Front: What does cluster actually speed up?
//   Back : Concurrent CPU-bound throughput across requests — not any single
//          request.
//
// Flashcard 6:
//   Front: Most common cluster-caused production bug?
//   Back : Module-level state (rate limits, caches, sessions) that silently
//          becomes "per worker" instead of "per app".
//
// Flashcard 7:
//   Front: Cluster vs Worker Threads?
//   Back : Cluster scales the whole server across processes with crash
//          isolation. Worker Threads scale one function within a process,
//          more cheaply.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "The payoff is concurrency and crash isolation, not per-request
//          speed — and the price is that nothing is shared unless you put it
//          outside the process."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Run §3 with 1 worker instead of 4. Confirm every request comes back with
//   the same PID.
//
// Task 2:
//   Add a real fix to §4: move the counter into a shared object passed
//   through the primary via IPC (cluster.workers[id].on('message', …)) and
//   confirm the total finally reaches 6.
//
// Task 3:
//   Replace §5's SIGKILL with worker.disconnect() and compare: does a
//   request that was ALREADY IN FLIGHT on that worker still complete?
//
// Task 4:
//   Raise §6's worker count past os.cpus().length and confirm throughput
//   stops improving (or gets worse) beyond the core count.
//
// Task 5:
//   Build the full self-healing pattern: N workers, respawn on every exit,
//   with a cap so a crash-looping worker doesn't fork forever.
//
// Task 6:
//   Send a message from the primary to every worker with
//   cluster.workers[id].send() and have each reply with its PID — this is
//   the mechanism a real shared-cache workaround is built on.
//
// Task 7:
//   Measure baseline RSS for 1 worker vs 4 with `process.memoryUsage()`
//   summed across workers (have each report its own via IPC) — see the "4×
//   the memory" claim from §7 for yourself.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Cluster is fork() for servers — one shared port, N processes, zero
//   shared memory. The isolation IS the feature; the missing sharing is the
//   price.
//
// If you remember the common bug:
//   A module-level counter, cache, or session store that silently becomes
//   "per worker" the moment you add a second one.
//
// If you remember the professional framing:
//   Cluster buys core-count concurrency and crash isolation for a whole
//   server. It does not buy shared state, sticky sessions, or zero-downtime
//   deploys — those are still yours to build.
//
// NEXT TOPIC -> 09_thread-pool-libuv.js


(async function main() {
  const port3 = await getFreePort();
  await section3(port3);

  const port4 = await getFreePort();
  await section4(port4);

  const port5 = await getFreePort();
  await section5(port5);

  const port6 = await getFreePort();
  await section6(port6);

  assertions();
})();

} // end cluster.isPrimary


// ══════════════════════════════════════════════════════════════════
// CLUSTER WORKER — everything below only runs inside a real cluster.fork()
// worker. The §6 single-server baseline is handled entirely above, before
// this point, because it is NOT a cluster worker at all.
// ══════════════════════════════════════════════════════════════════

function cpuWork() {
  let x = 0;
  for (let i = 0; i < 25_000_000; i++) x += Math.sqrt(i);
  return x;
}

if (cluster.isWorker) {
  const mode = process.env.WORKER_MODE;
  const port = Number(process.env.PORT);

  if (mode === "roundrobin") {
    http.createServer((req, res) => res.end(String(process.pid))).listen(port);

  } else if (mode === "counter") {
    let counter = 0;                                  // ← lives ONLY in this process
    http.createServer((req, res) => {
      counter++;
      res.end(`pid=${process.pid} counter=${counter}`);
    }).listen(port);

  } else if (mode === "cpu") {
    http.createServer((req, res) => {
      cpuWork();
      res.end(String(process.pid));
    }).listen(port);
  }
}
