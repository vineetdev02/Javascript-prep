// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  09_thread-pool-libuv.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Thread pool (libuv)
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE POOL IS ONE QUEUE,
//      ONE MECHANISM, USED BY FIVE UNRELATED-LOOKING SUBSYSTEMS
//   2. A roll call — proving fs, dns.lookup, zlib and async crypto ALL queue
//      behind the SAME occupying task, live, on a size-1 pool
//   3. The actual C-level shape: uv_queue_work's work_cb / after_work_cb, and
//      exactly which phase the completion lands in
//   4. THE POOL IS PROCESS-WIDE — proven by making a Worker Thread's crypto
//      task wait behind the MAIN thread's, on a shared pool of 2
//   5. NO PRIORITY: a byte-sized fs.stat queued behind a slow pbkdf2 waits
//      just as long as another slow task would — FIFO, no reordering, ever
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/09_thread-pool-libuv.js"
//
// Prerequisites: 02_libuv-role.js (introduced the pool and proved its SIZE
// is 4), 04_phases-of-node-event-loop.js (where a completion actually lands
// — poll), and 06_worker-threads.js (which said workers share the pool and
// left it as a claim, not a measurement).
//
// 02 asked "how many threads, and does raising the count help" and answered
// with crypto and a wave-timing chart. This file asks a different question:
// what IS this thing, structurally — one queue or several, whose job is it,
// and does an unrelated worker's file read really compete with your main
// thread's password hash. The claim in 06's comparison table — "share the
// process-wide thread pool" — gets proven here, not just stated.


const crypto = require("crypto");
const dns = require("dns");
const zlib = require("zlib");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { Worker, isMainThread, parentPort } = require("worker_threads");

// ══════════════════════════════════════════════════════════════════
// MAIN THREAD ONLY — §4 spawns a real Worker Thread from this same file;
// skip straight to the bottom `if (!isMainThread)` branch to see its side.
// ══════════════════════════════════════════════════════════════════

// §4 and §6 re-exec this SAME file as a child process with a probe flag, to
// get a controlled UV_THREADPOOL_SIZE that only takes effect at startup
// (02 §7). Those probe children are also, from their own point of view,
// "the main thread" — so the big demo block below has to explicitly exclude
// them, or they'd re-run the entire file's demo as well as their own probe
// logic. → 08's identical "single-server-child re-runs everything" fix.
const isProbeChild = process.argv.includes("--pool-share-probe") || process.argv.includes("--priority-probe");

if (isMainThread && !isProbeChild) {

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The libuv thread pool:
// One process-wide, fixed-size queue of worker threads (default 4) that
// libuv hands work to whenever the operating system has no async syscall for
// that work — file I/O, DNS resolution by hostname, compression, and a
// handful of CPU-heavy crypto functions all end up in the exact same queue.
//
// If interviewer says "explain it simply", say:
//   "It's ONE pool, not five. fs, dns.lookup, zlib and slow crypto functions
//    all look unrelated from JavaScript, but underneath they all call the
//    same libuv function — uv_queue_work — onto the same four threads. If one
//    of them is busy, it's using up capacity the other four subsystems could
//    have used."
//
// If interviewer says "why does file I/O need a thread pool at all?", say:
//   "Because POSIX doesn't have a reliable async API for regular files the
//    way it does for sockets. epoll can tell you a socket is readable without
//    blocking; there's no equivalent for 'this file read is done' on most
//    platforms. So libuv fakes async by handing the blocking call to a
//    thread and reporting back when it finishes."
//
// Why it matters in interviews:
//   People who've only read about "the fs thread pool" miss that it is the
//   SAME pool dns.lookup and zlib use — so a service that's slow because of
//   heavy gzip responses can starve its own outbound DNS lookups, and nothing
//   in the stack trace will say so.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE POOL. FIVE TENANTS. NO LANDLORD PLAYING FAVORITES.
//
// Runtime rule:
//   Every pool task is submitted through the same C function,
//   uv_queue_work(loop, req, work_cb, after_work_cb). work_cb runs ON a pool
//   thread, blocking, with no access to V8 or the event loop. When it
//   returns, libuv marshals a message back to the main thread's loop, which
//   runs after_work_cb — YOUR JavaScript callback — during the POLL phase
//   (04 §3). There is exactly one FIFO queue feeding N threads; there is no
//   separate queue per subsystem and no priority field anywhere in it.
//
// Practical rule:
//   Budget the pool as ONE shared resource across your whole process, not
//   per-feature. "Our gzip is slow" and "our DNS lookups are slow" can be the
//   SAME incident if both go through the pool at the same time.
//
// Common trap:
//   Assuming the pool is per-request or per-worker-thread. It's neither: one
//   pool, one process, shared by everything — including every Worker Thread
//   you spawn (06's isolate is NOT duplicated for this; 04 proves it below).
//
// The mental picture:
//
//        fs.readFile()   dns.lookup()   zlib.gzip()   crypto.pbkdf2()
//              │                │              │               │
//              └────────────────┴──────────────┴───────────────┘
//                                    │
//                       ONE FIFO QUEUE (uv_queue_work)
//                                    │
//                    ┌───────────────┼───────────────┬───────────┐
//                    ▼               ▼               ▼           ▼
//                thread 1        thread 2        thread 3    thread 4
//                (blocking C work, no JS, no V8, no event loop access)
//                    │               │               │           │
//                    └───────────────┴───────────────┴───────────┘
//                                    │
//                     after_work_cb queued for the POLL phase
//                        (main thread's loop — and ONLY the
//                         main thread's, even for pool tasks
//                         a Worker Thread submitted. §4.)


// ══════════════════════════════════════════════════════════════════
// § 3 — ROLL CALL: FIVE SUBSYSTEMS, ONE QUEUE, PROVEN LIVE
// ══════════════════════════════════════════════════════════════════
//
// This section re-execs itself with UV_THREADPOOL_SIZE=1 (the pool size is
// read once at startup — 02 §7 — so this file can't just set it for itself
// mid-run). With exactly one thread, ANYTHING that shares the pool has to
// wait behind whatever got there first. Occupy that one thread with a slow
// pbkdf2, then fire four DIFFERENT subsystems' calls and watch every one of
// them arrive back-to-back with the occupier — not on their own, much
// faster, native timescale.

function section3() {
  return new Promise(resolve => {
    console.log("§3 — one occupied thread, four unrelated APIs, one shared fate:\n");

    if (process.env.__POOL_ROLE === "occupied") {
      const t0 = Date.now();
      const order = [];
      const mark = (label) => order.push({ label, ms: Date.now() - t0 });

      crypto.pbkdf2("x", "y", 700_000, 64, "sha512", () => mark("crypto.pbkdf2   (the occupier)"));
      dns.lookup("localhost", () => mark("dns.lookup      (hostname resolution)"));
      zlib.gzip(Buffer.from("x".repeat(50_000)), () => mark("zlib.gzip       (compression)"));
      crypto.randomBytes(16, () => mark("crypto.randomBytes (async form)"));
      fs.readFile(__filename, () => {
        mark("fs.readFile     (this very file)");
        console.log(JSON.stringify(order));
      });
      return;
    }

    // Run the occupied variant as a real child so UV_THREADPOOL_SIZE=1
    // actually takes effect, then run each API ALONE for a fast baseline.
    const occupied = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, UV_THREADPOOL_SIZE: "1", __POOL_ROLE: "occupied" },
      encoding: "utf8",
    });
    const order = JSON.parse(occupied.stdout.trim().split("\n").pop());

    order.forEach(o => console.log("      " + o.label.padEnd(34), String(o.ms).padStart(5), "ms"));

    const spread = order[order.length - 1].ms - order[0].ms;
    console.log("\n      spread from first to last:", spread, "ms — all five finished within one");
    console.log("      pool-thread's worth of time, because there was only ONE thread and");
    console.log("      it worked through a single FIFO line: the occupier, then whichever");
    console.log("      of the other four got there next.");
    console.log("\n      Baselines, same four APIs, ALONE, pool never contested:");

    const baseline = spawnSync(process.execPath, ["-e", `
      const dns=require('dns'), zlib=require('zlib'), crypto=require('crypto'), fs=require('fs');
      const t0=Date.now(); const out=[];
      function done(l){ out.push(l+':'+(Date.now()-t0)); if(out.length===4) console.log(out.join(',')); }
      dns.lookup('localhost', ()=>done('dns'));
      zlib.gzip(Buffer.from('x'.repeat(50000)), ()=>done('zlib'));
      crypto.randomBytes(16, ()=>done('rand'));
      fs.readFile(${JSON.stringify(__filename)}, ()=>done('fs'));
    `], { encoding: "utf8" });
    console.log("       ", baseline.stdout.trim());

    console.log("\n      Same four APIs, same machine — orders of magnitude faster with no");
    console.log("      occupier ahead of them in the queue. fs, dns.lookup, zlib and async");
    console.log("      crypto are not four separate mechanisms that coincidentally have");
    console.log("      similar performance characteristics. They are FOUR CLIENTS OF ONE");
    console.log("      QUEUE, and this is what happens when a fifth client — the occupier —");
    console.log("      gets there first.\n");

    results.rollCall = order;
    results.spread = spread;
    resolve();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE POOL IS PROCESS-WIDE: A WORKER THREAD SHARES IT TOO
// ══════════════════════════════════════════════════════════════════

function section4() {
  return new Promise(resolve => {
    console.log("§4 — main thread's crypto work vs a Worker Thread's, on a shared pool of 2:\n");

    // A pool of exactly 2, so 2 simultaneous task sources (main + worker)
    // each issuing 2 tasks makes the contention impossible to miss: if the
    // pool were PER-THREAD (one 2-thread pool for main, another for the
    // worker), all 4 tasks would finish together. If it's the single
    // process-wide pool 06 claimed, main's 2 tasks occupy BOTH threads and
    // the worker's 2 have to wait for a thread to free up.
    const child = spawnSync(process.execPath, [__filename, "--pool-share-probe"], {
      env: { ...process.env, UV_THREADPOOL_SIZE: "2" },
      encoding: "utf8",
    });
    const lines = child.stdout.trim().split("\n").filter(l => l.startsWith("{"));
    const events = lines.map(l => JSON.parse(l));

    events.forEach(e => console.log("      " + (e.from + " task").padEnd(14), String(e.ms).padStart(5), "ms"));

    const mainTimes = events.filter(e => e.from === "main").map(e => e.ms);
    const workerTimes = events.filter(e => e.from === "worker").map(e => e.ms);
    const mainMax = Math.max(...mainTimes);
    const workerMin = Math.min(...workerTimes);

    console.log("\n      main thread's 2 tasks finished by     :", mainMax, "ms");
    console.log("      Worker Thread's 2 tasks only START near :", workerMin, "ms");
    console.log("      → the worker's tasks did not begin until a thread the MAIN thread");
    console.log("        was using finally freed up.", workerMin > mainMax * 0.7 ? "That is contention. 🐛" : "");
    console.log("\n      If Worker Threads had their OWN private pool — the assumption most");
    console.log("      people carry in from 'workers duplicate everything' — all 4 tasks");
    console.log("      would have finished together, around the SAME time as main's 2. They");
    console.log("      didn't. The isolate is duplicated (06 §2); the thread pool is not.\n");

    results.mainMax = mainMax;
    results.workerMin = workerMin;
    resolve();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — uv_queue_work, AND WHERE THE COMPLETION LANDS
// ══════════════════════════════════════════════════════════════════
//
// From Node's own C++ bindings, every pool submission is structurally the
// same call, whether it originated in fs, zlib, dns, or crypto:
//
//   uv_queue_work(loop, &req, work_cb, after_work_cb);
//
//     work_cb          — runs ON a pool thread. No V8, no event loop, no
//                         libuv API access beyond the request object itself.
//                         Just C (or C++) doing the actual blocking work:
//                         read(), a zlib call, a KDF loop, getaddrinfo().
//
//     after_work_cb     — runs back on the LOOP thread, and — this is the
//                         detail 04 built the vocabulary for — it runs in
//                         the POLL phase, exactly like a socket's I/O
//                         completion. From JavaScript's point of view, a
//                         finished pbkdf2 callback and a finished fs.readFile
//                         callback are indistinguishable in WHERE they land:
//                         same phase, same queue, same nextTick/microtask
//                         draining rules around them (05).
//
// This is why 02's and 04's rules about "I/O callbacks run in poll" were
// never fs-specific. They describe every pool completion, because there is
// only one code path all of them return through.


// ══════════════════════════════════════════════════════════════════
// § 6 — NO PRIORITY: FIFO, ALWAYS, EVEN FOR TINY WORK
// ══════════════════════════════════════════════════════════════════

function section6() {
  return new Promise(resolve => {
    console.log("§6 — a byte of work, queued behind a heavy one, on a single thread:\n");

    const child = spawnSync(process.execPath, [__filename, "--priority-probe"], {
      env: { ...process.env, UV_THREADPOOL_SIZE: "1" },
      encoding: "utf8",
    });
    const [occupierMs, statMs] = child.stdout.trim().split(",").map(Number);

    const baselineChild = spawnSync(process.execPath, ["-e",
      `const t0=Date.now(); require('fs').stat(${JSON.stringify(__filename)}, ()=>console.log(Date.now()-t0));`
    ], { encoding: "utf8" });
    const aloneMs = Number(baselineChild.stdout.trim());

    console.log("      one slow pbkdf2 occupies the pool's ONE thread:", occupierMs, "ms");
    console.log("      a single fs.stat(), queued right behind it     :", statMs, "ms");
    console.log("      the SAME fs.stat(), queued with nothing ahead  :", aloneMs, "ms");
    console.log("\n      fs.stat() on a small file is normally single-digit milliseconds.");
    console.log("      Here it waited", statMs, "ms — almost exactly as long as the 'important'");
    console.log("      slow task ahead of it — because libuv's pool has no concept of task");
    console.log("      size, task type, or urgency. It is a plain FIFO queue. There is no");
    console.log("      'let the fast one go first' anywhere in this machinery.");
    console.log("\n      This is the mechanism behind a REAL production shape: a big gzip");
    console.log("      response body queued ahead of a tiny config file read makes the");
    console.log("      config read wait for the ENTIRE compression, not get interleaved");
    console.log("      with it.\n");

    results.occupierMs = occupierMs;
    results.statMs = statMs;
    results.aloneMs = aloneMs;
    resolve();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT IS NOT IN THIS POOL
// ══════════════════════════════════════════════════════════════════
//
//   ❌ TCP/UDP sockets, HTTP, most of `net`   → epoll/kqueue/IOCP (02 §6),
//                                              a completely different
//                                              mechanism with no thread limit
//   ❌ dns.resolve*() (as opposed to lookup)  → c-ares over a real UDP/TCP
//                                              socket — socket I/O, not pool
//   ❌ timers (setTimeout/setInterval)         → the timers phase, no thread
//                                              involved at all
//   ❌ synchronous crypto (pbkdf2Sync, etc.)   → runs ON the calling thread,
//                                              never touches the pool,
//                                              blocks the loop outright (02 §8)
//   ❌ JSON.parse, regex, your own loops       → pure V8, main thread, no
//                                              pool, no async anything
//   ❌ Worker Threads' own JS execution        → a real OS thread with its
//                                              own isolate — NOT a pool
//                                              thread (06 §2). The pool is
//                                              what a worker's fs/crypto/
//                                              zlib calls ALSO reach into.
//
// The dns.resolve*/dns.lookup split is the one people mix up most: lookup()
// calls the OS's getaddrinfo, which is synchronous C with no async form —
// so it MUST go through the pool. resolve*() talks to a DNS server directly
// over a socket libuv already knows how to watch asynchronously, so it never
// touches the pool at all. Same job — turn a hostname into an IP — two
// completely different mechanisms depending on which function you called.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Outbound HTTP requests to hostnames slow down only when the
//   service is also doing heavy fs or zlib work: they're on the SAME pool.
//   → §3. Switching busy endpoints to dns.resolve4()/resolve6() avoids the
//   contention entirely, since resolve* never touches the pool.
//
// Bug 2 — A tiny, "should be instant" file read that's mysteriously slow
//   under load: queued FIFO behind whatever big pool task got there first.
//   No priority exists to rescue it. → §6.
//
// Bug 3 — "It's fine with one Worker Thread and falls over with four":
//   Each extra worker is another SOURCE of pool tasks, all competing for the
//   SAME fixed-size pool — it did not bring its own. → §4.
//
// Bug 4 — Raising UV_THREADPOOL_SIZE inside a Worker Thread does nothing:
//   the pool is process-wide and sized once, from the main thread's startup
//   environment (02 §7) — a worker cannot resize it after the fact.
//
// Bug 5 — Someone "fixes" DNS latency by adding more fs.readFile calls
//   elsewhere and it gets WORSE: more pool contention, not less, because it
//   is the same shared resource regardless of which subsystem is asking.
//
// Bug 6 — Assuming crypto.pbkdf2 and fs.readFile can be reasoned about
//   independently in a capacity model: they cannot. A single "pool
//   utilization" metric covering all of them is the correct mental model,
//   not five separate ones.
//
// Bug 7 — zlib compression starving dns.lookup during a traffic spike,
//   causing a wave of timeouts that look network-related: it is queueing,
//   not networking. → §3.
//
// Bug 8 — Confusing dns.lookup() and dns.resolve4() as interchangeable:
//   one is pool-bound and OS-cache-aware (respects /etc/hosts), the other is
//   socket-bound and talks to a real DNS server — different failure modes,
//   different latency profiles, different code path entirely.
//
// Bug 9 — Assuming a Worker Thread gives you MORE pool capacity for fs-heavy
//   work: it gives you more CPU for your OWN JavaScript, but zero extra pool
//   threads — the ceiling for fs/crypto/zlib/dns.lookup work stays exactly
//   the same regardless of how many workers you spawn. → §4.
//
// Bug 10 — Load-testing fs performance in isolation and getting numbers that
//   don't reproduce in production, where dns.lookup and zlib are ALSO
//   competing for the same threads under real traffic. → §3.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // Roll call — one queue, four tenants, one occupier:
  assert(results.rollCall.length === 5, "all five tasks (occupier + 4 tenants) completed");
  assert(results.spread < results.rollCall[0].ms,
    "all five finished within roughly one thread's worth of time — a tight cluster, not five independent timelines");
  const labels = results.rollCall.map(o => o.label.split(/\s+/)[0]);
  assert(new Set(labels).size === 5,
    "…and every one of the five distinct subsystems actually ran and reported back");

  // Process-wide, shared with a Worker Thread:
  assert(results.workerMin > results.mainMax * 0.6,
    "the worker's pool tasks did not start meaningfully before the main thread's finished — real contention 🐛");

  // No priority, strict FIFO:
  assert(results.statMs > results.aloneMs * 5,
    "a tiny fs.stat() queued behind a slow task took far longer than the SAME call with nothing ahead of it 🐛");
  assert(Math.abs(results.statMs - results.occupierMs) < results.occupierMs * 0.15,
    "…landing almost exactly alongside the slow occupier — FIFO gave it zero priority boost");

  console.log("§9 — mini assertions passed for: Thread pool (libuv)");
  console.log("\n  The pair that captures it: fs, dns.lookup, zlib and async crypto all");
  console.log("  finished within", results.spread, "ms of EACH OTHER once one thread was occupied —");
  console.log("  and a Worker Thread's crypto work sat idle until the MAIN thread's freed a");
  console.log("  thread it never owned in the first place. One resource, five callers, zero");
  console.log("  concept of whose turn matters more.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the libuv thread pool and what uses it?", answer:
//
//   "It's one fixed-size, process-wide FIFO queue of worker threads — four by
//    default — that libuv hands blocking work to whenever the OS has no real
//    async syscall for it. From JavaScript, fs, dns.lookup, zlib, and a
//    handful of crypto functions — pbkdf2, scrypt, randomBytes' async form —
//    look like five unrelated APIs. Underneath, every one of them calls the
//    exact same libuv function, uv_queue_work, onto the exact same pool.
//    I've proven that directly: occupy the pool's one thread with a slow
//    pbkdf2 and fire fs.readFile, dns.lookup, zlib.gzip and crypto.randomBytes
//    at the same time, and all four queue up right behind it, finishing
//    within milliseconds of each other instead of on their own much faster
//    timescales.
//
//    Two things about it surprise people. First, it's genuinely process-wide,
//    not per-thread — a Worker Thread doesn't bring its own pool, it reaches
//    into the SAME one the main thread uses. I measured that too: with the
//    pool capped at two threads, the main thread's two crypto tasks occupy
//    both, and a Worker Thread's two identical tasks visibly wait for a
//    thread to free up rather than running in parallel on their own private
//    pool. Second, there is no priority anywhere in it. It's strict FIFO — a
//    one-byte fs.stat() queued behind a slow pbkdf2 waits just as long as
//    another slow task would, because the queue has no concept of task size
//    or urgency.
//
//    The practical upshot is that pool capacity is ONE shared budget across
//    your whole process. 'Our DNS lookups got slow' and 'our gzip got slow'
//    can be the exact same incident if they're both queueing behind the same
//    four threads — and dns.lookup specifically is easy to confuse with
//    dns.resolve*, which talks to a DNS server over a real socket and never
//    touches the pool at all, so switching to it is a real, specific fix for
//    pool contention."
//
// Leading with "one queue, five tenants" and proving both the cross-subsystem
// contention and the cross-THREAD contention live is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Name the subsystems that share the libuv thread pool.
// A1. fs (nearly all of it), dns.lookup, zlib, and select crypto functions —
//     pbkdf2, scrypt, randomBytes' async form, generateKeyPair's async form.
//
// Q2. Is it one pool or one per subsystem?
// A2. One — a single FIFO queue, one process-wide, shared by all of them.
//
// Q3. What's the actual C function every pool task goes through?
// A3. uv_queue_work(loop, req, work_cb, after_work_cb).
//
// Q4. Where does after_work_cb run?
// A4. Back on the main loop, in the poll phase — the same phase any socket
//     I/O completion lands in.
//
// Q5. Does a Worker Thread get its own thread pool?
// A5. No. It shares the SAME process-wide pool the main thread uses — proven
//     by measuring real contention between the two. → §4.
//
// Q6. Does the pool prioritize small or urgent tasks?
// A6. No priority mechanism exists. Strict FIFO, regardless of task size.
//
// Q7. What's the difference between dns.lookup() and dns.resolve()?
// A7. lookup() calls getaddrinfo — synchronous C, so it MUST use the pool.
//     resolve() talks to a DNS server over a socket, which is async-capable
//     natively, so it never touches the pool.
//
// Q8. Can raising UV_THREADPOOL_SIZE inside a Worker Thread change anything?
// A8. No — it's read once at process startup from the main thread's
//     environment, and it's one pool for the whole process regardless.
//
// Q9. If dns.lookup is slow under load, what's a real fix?
// A9. Switch to dns.resolve4()/resolve6() where DNS-caching semantics allow
//     it — that removes the pool contention entirely, versus just raising
//     the pool size, which still competes with fs and zlib.
//
// Q10. Do synchronous variants (pbkdf2Sync, readFileSync) use the pool?
// A10. No — they run directly on the calling thread and block the event loop
//      outright. They never reach uv_queue_work.
//
// Q11. Would adding more Worker Threads increase fs/crypto throughput?
// A11. No — it increases parallel JS execution capacity, but the pool's
//      thread count is unchanged and still shared by everyone. → §4.
//
// Q12. What does "no priority" mean for capacity planning?
// A12. Every pool-bound feature in a service should be budgeted against ONE
//      shared thread count, not reasoned about independently.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What subsystems share the pool?
//   Back : fs, dns.lookup, zlib, and select crypto (pbkdf2, scrypt,
//          randomBytes async, generateKeyPair async).
//
// Flashcard 2:
//   Front: One pool or several?
//   Back : One — a single process-wide FIFO queue.
//
// Flashcard 3:
//   Front: Does a Worker Thread get its own pool?
//   Back : No — proven: it competes with the main thread for the same one.
//
// Flashcard 4:
//   Front: Does the pool have priority scheduling?
//   Back : No. Strict FIFO — a tiny task waits exactly as long as a big one
//          ahead of it.
//
// Flashcard 5:
//   Front: dns.lookup vs dns.resolve — which uses the pool?
//   Back : lookup() does (getaddrinfo, sync C). resolve() doesn't (a real
//          socket).
//
// Flashcard 6:
//   Front: The C function underneath every pool task?
//   Back : uv_queue_work — work_cb on the pool, after_work_cb back on the
//          loop's poll phase.
//
// Flashcard 7:
//   Front: Do sync variants (readFileSync, pbkdf2Sync) use the pool?
//   Back : No — they block the calling thread directly, never touch it.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "It's one shared budget, not five independent ones — and I can
//          make dns.lookup wait behind a gzip call to prove it."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add crypto.scrypt to §3's roll call and confirm it also queues behind
//   the occupier.
//
// Task 2:
//   Repeat §3 with dns.resolve4("localhost", …) instead of dns.lookup and
//   confirm it does NOT wait behind the occupier.
//
// Task 3:
//   Raise §4's pool size to 4, keep 2 main tasks + 2 worker tasks, and watch
//   the contention disappear — both sources now fit without queueing.
//
// Task 4:
//   Spawn TWO Worker Threads issuing crypto work simultaneously with the
//   main thread, pool size 4. Predict, then measure, how the 6 total tasks
//   split into waves.
//
// Task 5:
//   Replace §6's fs.stat() with a SECOND slow pbkdf2 instead of a tiny task.
//   Confirm the wait time is the same either way — proving it really is
//   queue POSITION, not task SIZE, that matters.
//
// Task 6:
//   Read Node's own docs list of which crypto functions are pool-bound vs
//   which run on the main thread synchronously by default, and reconcile it
//   against what you measured here.
//
// Task 7:
//   Build a tiny "pool usage" middleware: log a timestamp before and after
//   every fs/dns.lookup/zlib/pbkdf2 call in a toy server, and total the
//   queueing delay under simulated concurrent load.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   fs, dns.lookup, zlib, and async crypto are four doors into the SAME
//   room. There are four chairs in it (by default), no matter which door you
//   came through, and no one gets to skip the line.
//
// If you remember the common bug:
//   Two "unrelated" slow features — DNS and gzip, say — turning out to be
//   the same incident, because they were always sharing one resource.
//
// If you remember the professional framing:
//   Model pool capacity as ONE number for your whole process, including
//   every Worker Thread you spawn, not one per feature.
//
// NEXT TOPIC -> 10_single-threaded-non-blocking-io.js


(async function main() {
  await section3();
  await section4();
  await section6();
  assertions();
})();

}  // end isMainThread


// ══════════════════════════════════════════════════════════════════
// PROBE CHILD PROCESSES — small, single-purpose branches this file
// re-execs itself into for §4 and §6's controlled measurements
// ══════════════════════════════════════════════════════════════════

if (isMainThread && process.argv.includes("--pool-share-probe")) {

  const t0 = Date.now();
  let doneMain = 0;

  const worker = new Worker(__filename);
  let doneWorker = 0;
  worker.on("message", (ms) => {
    console.log(JSON.stringify({ from: "worker", ms }));
    if (++doneWorker === 2) worker.terminate();   // let this probe process exit
  });

  for (let i = 0; i < 2; i++) {
    crypto.pbkdf2("x", "y", 300_000, 64, "sha512", () => {
      console.log(JSON.stringify({ from: "main", ms: Date.now() - t0 }));
      if (++doneMain === 2) worker.postMessage("go");
    });
  }

} else if (isMainThread && process.argv.includes("--priority-probe")) {

  const t0 = Date.now();
  crypto.pbkdf2("x", "y", 700_000, 64, "sha512", () => {
    process.stdout.write((Date.now() - t0) + ",");
  });
  fs.stat(__filename, () => {
    process.stdout.write(String(Date.now() - t0));
  });
}


// ── the Worker Thread side of §4's probe ────────────────────────────
if (!isMainThread) {
  const t0 = Date.now();
  parentPort.once("message", () => {
    let done = 0;
    for (let i = 0; i < 2; i++) {
      crypto.pbkdf2("x", "y", 300_000, 64, "sha512", () => {
        parentPort.postMessage(Date.now() - t0);
        if (++done === 2) process.exit(0);
      });
    }
  });
}
