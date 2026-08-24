// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  02_libuv-role.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: libuv role
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: libuv IS NODE'S OPERATING
//      SYSTEM — the event loop, the thread pool, and every async I/O call
//   2. Handles vs requests, and why your process refuses to exit
//   3. The thread pool is FOUR threads, proved by watching 8 tasks finish in
//      two waves — and UV_THREADPOOL_SIZE proved by a child process
//   4. The two completely different async mechanisms: epoll for sockets,
//      a thread pool for files — and why that distinction decides your fixes
//   5. What is NOT libuv: DNS resolution, crypto maths, JSON, your own loops
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/02_libuv-role.js"
//
// Prerequisites: 01_v8-engine-role.js. That file drew a box labelled "libuv"
// and left it empty. This file fills it in.
//
// 01 ended on a boundary: V8 runs JavaScript and knows nothing about files,
// sockets, timers or threads. Something has to. That something is a ~30,000
// line C library called libuv, originally written FOR Node and now used by
// Julia, pyuv, Neovim and Luvit too. Every remaining file in this group —
// the loop phases, nextTick, workers, cluster, blocking I/O — is a detail of
// what you are about to see.


const crypto = require("crypto");
const net = require("net");
const os = require("os");
const fs = require("fs");
const { spawnSync } = require("child_process");

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// libuv:
// The cross-platform C library that gives Node an event loop, a thread pool,
// and one uniform async API over each operating system's very different
// notions of "tell me when this is ready".
//
// If interviewer says "explain it simply", say:
//   "V8 gave Node a language. libuv gave it an operating system. Every timer,
//    every socket, every file read and the event loop itself are libuv — Node's
//    fs and net modules are thin JavaScript over libuv calls."
//
// If interviewer says "why does it need to exist at all?", say:
//   "Because 'wait for many things at once' has a different API on every OS:
//    epoll on Linux, kqueue on macOS and the BSDs, IOCP on Windows, event ports
//    on SunOS. libuv hides all four behind one interface. And where the OS has
//    no usable async API at all — file I/O is the big one — libuv fakes it with
//    a thread pool."
//
// Why it matters in interviews:
//   The single most useful sentence in a Node interview is "that depends on
//   whether it is socket I/O or thread-pool I/O." Sockets scale to tens of
//   thousands of concurrent operations because the kernel does the waiting.
//   Files, DNS lookups, zlib and pbkdf2 go through a pool of FOUR threads and
//   queue behind each other. Same `await`, completely different scaling story,
//   completely different fix when it is slow. §5 and §6 prove both halves.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE LOOP, TWO MECHANISMS.
//
// Runtime rule:
//   libuv runs one loop on the main thread. For each pending operation it uses
//   whichever mechanism fits:
//     (a) the kernel's readiness notifier (epoll/kqueue/IOCP) — for sockets,
//         pipes, TTYs, and signals. Cost per extra operation ≈ zero.
//     (b) its own thread pool, default size 4 — for anything the OS cannot do
//         asynchronously: file system calls, dns.lookup, zlib, and the
//         CPU-heavy crypto functions.
//
// Practical rule:
//   Before you tune anything, ask which mechanism the slow thing uses. Raising
//   UV_THREADPOOL_SIZE fixes (b) and does absolutely nothing for (a). Adding
//   more processes (file 08) fixes CPU. Neither fixes a blocking sync call
//   (file 11), because that never reached libuv in the first place.
//
// Common trap:
//   "Node is asynchronous, so 100 concurrent fs.readFile calls all run at
//   once." They do not. Four run; ninety-six queue. That is §5, measured.
//
// The mental picture:
//
//        your JS  ──▶  fs.readFile / socket.write / setTimeout
//                          │
//                     C++ bindings
//                          │
//   ┌──────────────────── libuv ─────────────────────────────────┐
//   │                                                            │
//   │   uv_run()  — the loop, on the main thread                 │
//   │      │                                                     │
//   │      ├──▶ epoll/kqueue/IOCP  ── sockets, pipes, TTY, signals│
//   │      │      "the kernel does the waiting"   → unlimited     │
//   │      │                                                     │
//   │      └──▶ thread pool (4)    ── fs, dns.lookup, zlib,      │
//   │             ┌──┬──┬──┬──┐       pbkdf2/scrypt/randomBytes  │
//   │             │t1│t2│t3│t4│       "we do the waiting"        │
//   │             └──┴──┴──┴──┘       → queues after 4            │
//   │                                                            │
//   └────────────────────────────────────────────────────────────┘
//                          │
//        completion callback pushed back onto the loop, then run in JS


// ══════════════════════════════════════════════════════════════════
// § 3 — libuv IS A REAL, SEPARATE PIECE OF SOFTWARE
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the library, and the platform it is hiding:\n");

console.log("    process.versions.uv :", process.versions.uv, "  ← versioned independently of Node and V8");
console.log("    platform            :", os.platform(), "/", os.arch());
const BACKENDS = { linux: "epoll", darwin: "kqueue", freebsd: "kqueue", openbsd: "kqueue", win32: "IOCP", sunos: "event ports", aix: "pollset" };
console.log("    readiness backend   :", BACKENDS[os.platform()] || "(platform-specific)", "← libuv picked this; your code never mentions it");
console.log("    logical CPUs        :", os.cpus().length, "← matters for files 08 and 09, not for socket I/O");

console.log("\n    What libuv provides, all of which you have used without naming it:");
const PROVIDES = [
  ["the event loop (uv_run)", "→ file 04, the phases"],
  ["timers", "setTimeout / setInterval"],
  ["check handles", "setImmediate → file 05"],
  ["TCP / UDP / pipes / TTY", "net, http, process.stdout"],
  ["file system operations", "fs — via the thread pool"],
  ["child processes + signals", "child_process → file 07"],
  ["thread pool", "→ file 09"],
  ["async DNS (getaddrinfo)", "dns.lookup — also the pool"],
];
for (const [what, where] of PROVIDES) console.log("      • " + what.padEnd(28) + where);

console.log("\n  Node did not invent any of this in JavaScript. `fs.readFile` is about");
console.log("  40 lines of JS that ends in a C++ binding that calls uv_fs_read.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — HANDLES AND REQUESTS: WHY YOUR PROCESS WILL NOT EXIT
// ══════════════════════════════════════════════════════════════════

const results = {};
const server = net.createServer();

async function section4() {
console.log("§4 — the loop runs while it has work, and 'work' is a countable thing:\n");

// libuv tracks two kinds of thing:
//
//   HANDLE  — a long-lived object: a timer, a TCP server, a socket, a signal
//             watcher, stdin. Handles are REFERENCED by default, and a
//             referenced handle keeps the loop alive.
//   REQUEST — a short-lived operation: one fs read, one getaddrinfo, one
//             write. It completes once and is gone.
//
// `uv_run` returns — and Node exits with code 0 — when the reference count
// hits zero. This is why Node does not need a "main" that blocks: the loop
// exits by itself when nothing is left to wait for.
//
// process.getActiveResourcesInfo() is the JS window onto that count. What is
// already in it depends on how you launched this file: run it in a terminal
// and stdout is a TTY handle; pipe it into `less` and stdout is a PipeWrap.
// So we report the DELTA each step adds, not the raw list.

const baseline = process.getActiveResourcesInfo();
const added = (before, after) => {
  const b = [...before];
  return after.filter(x => { const k = b.indexOf(x); if (k === -1) return true; b.splice(k, 1); return false; });
};

console.log("    already active before we do anything:", JSON.stringify(baseline));
console.log("      (stdout/stderr — a TTY in a terminal, a PipeWrap when redirected)");

const keeper = setTimeout(() => {}, 60_000);
const withTimer = process.getActiveResourcesInfo();
console.log("\n    setTimeout(…, 60_000)  adds:", JSON.stringify(added(baseline, withTimer)));
console.log("      → this process would now sit here for a full minute doing nothing");

keeper.unref();
const afterUnref = process.getActiveResourcesInfo();
console.log("    keeper.unref()         adds:", JSON.stringify(added(baseline, afterUnref)), "← nothing");
console.log("      → the timer still EXISTS and will still fire if the loop is alive.");
console.log("        It just no longer votes on whether the loop STAYS alive ✅");

// listen() is itself asynchronous — the handle only joins the loop once the
// OS has actually bound the port, which is why we wait for "listening".
await new Promise(res => server.listen(0, "127.0.0.1", res));
const withServer = process.getActiveResourcesInfo();

console.log("\n    server.listen()        adds:", JSON.stringify(added(afterUnref, withServer)));
console.log("      → THAT is why an http server 'hangs' forever. Nothing is");
console.log("        blocking. libuv simply has one referenced handle, so the");
console.log("        reference count never reaches zero and uv_run never returns.");

console.log("\n  Three things this explains that people usually memorise separately:");
console.log("    • a script that ends but does not exit → a live handle you forgot");
console.log("      (an interval, a socket, a Redis client, a DB pool)");
console.log("    • .unref() on a metrics interval or a keep-alive agent → the classic fix");
console.log("    • process.exit() forcing an exit → it kills the loop with pending");
console.log("      writes still queued, which is how you lose the last log line\n");

  results.timerAdded = added(baseline, withTimer);
  results.unrefAdded = added(baseline, afterUnref);
  results.serverAdded = added(afterUnref, withServer);
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE THREAD POOL IS FOUR THREADS. WATCH IT.
// ══════════════════════════════════════════════════════════════════

// Everything below is async too — the whole file runs inside main().

async function section5() {
  console.log("§5 — 8 async crypto tasks, 4 threads, and the waves you can see:\n");

  // crypto.pbkdf2 is deliberately slow (that is its job) and it runs on the
  // libuv thread pool. Fire 8 at once and record when each one lands.
  const t0 = Date.now();
  const finishes = await new Promise(resolve => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      crypto.pbkdf2("password", "salt", 200_000, 64, "sha512", () => {
        out.push({ task: i, ms: Date.now() - t0 });
        if (out.length === 8) resolve(out);
      });
    }
  });

  finishes.sort((a, b) => a.ms - b.ms);
  const wave1 = finishes.slice(0, 4);
  const wave2 = finishes.slice(4);
  const gap = wave2[0].ms - wave1[3].ms;

  for (const f of finishes) {
    const bar = "█".repeat(Math.max(1, Math.round(f.ms / 40)));
    console.log("      task", String(f.task).padEnd(2), String(f.ms).padStart(5) + " ms  " + bar);
  }

  console.log("\n      wave 1 (threads 1-4) finished by :", wave1[3].ms, "ms");
  console.log("      wave 2 (the queue)   started after:", wave1[3].ms, "ms — it could not start earlier");
  console.log("      wave 2 finished by               :", wave2[3].ms, "ms");
  console.log("      ratio wave2/wave1                :", (wave2[3].ms / wave1[3].ms).toFixed(2) + "×",
    wave2[3].ms > wave1[3].ms * 1.5 ? "← two waves, not one 🐛" : "");

  console.log("\n  Read that again. All 8 calls were issued in the same tick, all 8 are");
  console.log("  'asynchronous', and 4 of them did not begin for", wave1[3].ms, "ms.");
  console.log("  That is not scheduling noise. That is a queue with 4 servers.");
  console.log("\n  What else shares those same 4 threads:");
  console.log("    fs.*  (every readFile, writeFile, stat, readdir)");
  console.log("    dns.lookup  ← and therefore every http request to a hostname");
  console.log("    zlib.*      ← every gzip in your response pipeline");
  console.log("    crypto: pbkdf2, scrypt, randomBytes, randomFill, generateKeyPair");
  console.log("  One slow user of the pool starves every other user of the pool. → file 09\n");

  results.wave1End = wave1[3].ms;
  results.wave2End = wave2[3].ms;
  results.gap = gap;
  results.finishes = finishes;
}


// ══════════════════════════════════════════════════════════════════
// § 6 — SOCKETS DO NOT TOUCH THE POOL
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("§6 — the same test with sockets, and no waves at all:\n");

  const echo = net.createServer(sock => {
    // hold each connection briefly, so all 12 are genuinely concurrent
    setTimeout(() => { sock.end("ok"); }, 120);
  });
  await new Promise(res => echo.listen(0, "127.0.0.1", res));
  const port = echo.address().port;

  const t0 = Date.now();
  const times = await Promise.all(
    Array.from({ length: 12 }, () => new Promise((resolve, reject) => {
      const c = net.connect(port, "127.0.0.1");
      c.on("data", () => {});
      c.on("end", () => resolve(Date.now() - t0));
      c.on("error", reject);
    }))
  );
  echo.close();

  const slowest = Math.max(...times);
  const fastest = Math.min(...times);
  const spread = slowest - fastest;

  console.log("      12 concurrent TCP connections, each held for 120 ms:");
  console.log("        fastest finished :", fastest, "ms");
  console.log("        slowest finished :", slowest, "ms");
  console.log("        spread           :", spread, "ms ← flat, not stepped ✅");
  console.log("        3× the hold time?:", slowest > 360 ? "yes 🐛" : "no — all 12 overlapped ✅");

  console.log("\n      Compare with §5: 8 pool tasks needed", results.wave2End, "ms and stepped");
  console.log("      in waves. 12 sockets needed", slowest, "ms and did not step at all.");
  console.log("      There is no pool of 12. The KERNEL is doing the waiting, and it");
  console.log("      does not care whether it is watching 12 descriptors or 12,000.");

  console.log("\n  This is the whole reason Node got a reputation for handling");
  console.log("  'thousands of concurrent connections'. It is true, and it is true");
  console.log("  only for the epoll/kqueue/IOCP half of libuv. → file 10\n");

  results.socketSlowest = slowest;
  results.socketSpread = spread;
}


// ══════════════════════════════════════════════════════════════════
// § 7 — UV_THREADPOOL_SIZE, PROVED IN A CHILD PROCESS
// ══════════════════════════════════════════════════════════════════

function section7() {
  console.log("§7 — the pool size is a startup env var. Here is the same test with 8:\n");

  // It must be a CHILD process: libuv sizes the pool once, on first use, and
  // never resizes it. Setting process.env.UV_THREADPOOL_SIZE after your first
  // fs call does nothing — a very common and very silent mistake.
  const probe = `
    const crypto = require("crypto");
    const t0 = Date.now(); const out = [];
    for (let i = 0; i < 8; i++)
      crypto.pbkdf2("password","salt",200000,64,"sha512",() => {
        out.push(Date.now()-t0);
        if (out.length===8) { out.sort((a,b)=>a-b);
          process.stdout.write(JSON.stringify({w1: out[3], w2: out[7]})); }
      });
  `;
  const run = spawnSync(process.execPath, ["-e", probe], {
    env: { ...process.env, UV_THREADPOOL_SIZE: "8" },
    encoding: "utf8",
  });
  const big = JSON.parse(run.stdout);

  console.log("      UV_THREADPOOL_SIZE=4 (this process):");
  console.log("        first 4 done at", String(results.wave1End).padStart(5), "ms · all 8 done at", results.wave2End, "ms");
  console.log("      UV_THREADPOOL_SIZE=8 (child process):");
  console.log("        first 4 done at", String(big.w1).padStart(5), "ms · all 8 done at", big.w2, "ms");
  console.log("\n      stepping ratio (all8 / first4):");
  console.log("        pool of 4 :", (results.wave2End / results.wave1End).toFixed(2) + "×", "← a second wave");
  console.log("        pool of 8 :", (big.w2 / big.w1).toFixed(2) + "×", "← one wave, all 8 ran together ✅");

  console.log("\n  The rules that matter:");
  console.log("    • it is read ONCE, at pool creation. Set it in the shell, in your");
  console.log("      Dockerfile, or with process.env at the very top of the entry file");
  console.log("      before anything touches fs — not after. 🐛");
  console.log("    • the cap is 1024.");
  console.log("    • more threads ≠ more speed. Above core count these tasks compete");
  console.log("      for the same CPUs; notice the pool of 8 was not 2× faster overall,");
  console.log("      it just started everything sooner. For I/O-bound pool work (fs)");
  console.log("      raising it helps; for CPU-bound pool work (pbkdf2) it mostly");
  console.log("      redistributes the same total time. → files 06 and 09\n");

  results.bigPool = big;
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT IS *NOT* libuv
// ══════════════════════════════════════════════════════════════════

function section8() {
  console.log("§8 — the calls that never reach libuv at all:\n");

  // A blocking sync call goes straight through the binding on the main thread.
  // No loop, no pool, no queue — and no chance for anything else to run.
  const tmp = require("path").join(os.tmpdir(), "libuv-demo-" + process.pid + ".txt");
  fs.writeFileSync(tmp, "x".repeat(1024 * 256));

  let ticks = 0;
  const iv = setInterval(() => ticks++, 1);

  const tSync = Date.now();
  for (let i = 0; i < 40; i++) fs.readFileSync(tmp);       // 🐛 main thread, 40 times
  const syncMs = Date.now() - tSync;
  const ticksDuringSync = ticks;

  clearInterval(iv);
  fs.unlinkSync(tmp);

  console.log("      40 × fs.readFileSync on the main thread:", syncMs, "ms");
  console.log("      1 ms timer ticks that fired during it  :", ticksDuringSync, "← the loop never ran 🐛");
  console.log("      (the pool has 4 idle threads the whole time and cannot help)");

  console.log("\n    Not libuv, and worth being able to list:");
  console.log("      • ANY *Sync API — readFileSync, execSync, crypto.pbkdf2Sync");
  console.log("      • JSON.parse / JSON.stringify — V8, on your thread, blocking");
  console.log("      • your own for-loops and regexes — V8, blocking (file 11)");
  console.log("      • Promise / microtask scheduling — V8's job queue (file 05)");
  console.log("      • dns.resolve* — c-ares, real network DNS, NOT the pool");
  console.log("        (dns.lookup IS the pool: it calls the OS getaddrinfo)");
  console.log("      • TLS maths and hashing — OpenSSL. Some of it is offered to the");
  console.log("        pool by Node's bindings; the algorithms are not libuv's.");
  console.log("      • Worker Threads' JS execution — real OS threads with their own");
  console.log("        V8 isolate AND their own libuv loop (file 06)");

  console.log("\n    That dns.lookup line is the one that bites in production: every");
  console.log("    outbound http request to a HOSTNAME does a getaddrinfo on the pool.");
  console.log("    A slow resolver plus four threads is a queue in front of your");
  console.log("    entire outbound traffic — and it looks like 'the network is slow'.\n");

  results.syncMs = syncMs;
  results.ticksDuringSync = ticksDuringSync;
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE FIX DEPENDS ON THE MECHANISM
// ══════════════════════════════════════════════════════════════════
//
// This table is the payoff of the whole file. Diagnose first, then pick.
//
//   symptom                              mechanism        fix
//   ───────                              ─────────        ───
//   many sockets, high latency           epoll            usually not libuv:
//                                                         look at your own JS
//                                                         (file 11) or the peer
//   fs-heavy service, latency scales     thread pool      UV_THREADPOOL_SIZE,
//     with concurrency in steps of 4                      or batch the reads
//   every outbound HTTP call is slow     thread pool      dns.lookup starvation;
//     but curl is fast                                    raise the pool or cache
//   one endpoint blocks all others       neither          sync/CPU on the main
//                                                         thread → file 11, then
//                                                         Worker Threads → file 06
//   CPU pinned at 100% on one core       neither          cluster → file 08
//   process never exits                  handles          an un-unref'd handle → §4
//
// Say the diagnosis before the fix. "I'd check whether it's socket I/O or
// pool I/O first" is the sentence that gets you the follow-up question.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Concurrency plateaus at 4 and nobody can see why:
//   fs or zlib work saturating the pool. Latency rises in steps. → §5.
//
// Bug 2 — UV_THREADPOOL_SIZE set in code and ignored:
//   Set after the first pool use. The pool is created once. → §7.
//
// Bug 3 — Every outbound HTTP request is slow, but only under load:
//   dns.lookup queued behind file reads on the same 4 threads. → §8.
//
// Bug 4 — The test suite hangs after all tests pass:
//   A referenced handle — an interval, a listening server, a DB pool. Jest's
//   "did not exit one second after" message is literally §4.
//
// Bug 5 — process.exit() and the last log line disappears:
//   stdout to a pipe is async. exit() tears the loop down with the write
//   still queued. → §4.
//
// Bug 6 — Raising UV_THREADPOOL_SIZE does nothing for a socket-bound service:
//   Sockets never used the pool. Wrong mechanism, wrong knob. → §6, §9.
//
// Bug 7 — A health check times out only while a big upload is being gzipped:
//   zlib on the pool, four threads, one big stream. → §5, and group 2 file 08.
//
// Bug 8 — "Async" code that freezes the timer loop entirely:
//   A *Sync call, which never reaches libuv. 0 timer ticks. → §8.
//
// Bug 9 — A Docker container with 32 cores that is no faster than 4:
//   The pool is 4 regardless of cores. libuv does not auto-size it.
//
// Bug 10 — Sporadic ECONNRESET under load that vanishes when you add threads:
//   The accept queue is fine; your callbacks are late because the loop is busy.
//   Adding threads moved work off the main thread. The real fix is file 06/08.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // libuv is real and separate:
  assert(typeof process.versions.uv === "string" && process.versions.uv.length > 0,
    "libuv is a real, separately-versioned dependency — like V8 in file 01");
  assert(process.versions.uv !== process.versions.v8,
    "...and a different project from V8. Two libraries, two jobs");

  // Handles and requests:
  assert(results.timerAdded.join() === "Timeout",
    "a pending timer is a referenced handle — it alone keeps the process alive");
  assert(results.unrefAdded.length === 0,
    "unref() removed it from the loop's reference count ✅");
  assert(results.serverAdded.join() === "TCPServerWrap",
    "a listening server IS a referenced handle — that is why http servers never exit 🐛→✅");

  // The pool has four threads:
  assert(results.finishes.length === 8, "all 8 pool tasks completed");
  assert(results.wave2End > results.wave1End * 1.5,
    "8 tasks on 4 threads finish in TWO waves: the last 4 took ~twice as long 🐛");
  assert(results.gap >= 0,
    "wave 2 could not start before wave 1 freed a thread");

  // Sockets are a different mechanism:
  assert(results.socketSlowest < 360,
    "12 concurrent sockets did NOT step in waves of 4 — the kernel waits, not a pool ✅");
  assert(results.socketSpread < results.wave1End,
    "...and their finish times are clustered, not stepped");

  // The pool is configurable, once, at startup:
  assert(results.bigPool.w2 / results.bigPool.w1 < results.wave2End / results.wave1End,
    "UV_THREADPOOL_SIZE=8 removed the second wave ✅");

  // Sync calls never reach libuv:
  assert(results.ticksDuringSync === 0,
    "40 sync reads let ZERO 1 ms timers fire — sync I/O bypasses the loop entirely 🐛");
  assert(results.syncMs > 0, "...and they really did take measurable time on the main thread");

  console.log("§11 — mini assertions passed for: libuv role");
  console.log("\n  The pair that captures it: 8 identical async crypto tasks finished in");
  console.log("  two waves —", results.wave1End + " ms then " + results.wave2End + " ms — because there are 4 threads,");
  console.log("  while 12 concurrent sockets all finished within", results.socketSpread, "ms of each other");
  console.log("  because there is no pool involved at all. Same `await`, two machines.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what does libuv do?", answer:
//
//   "libuv is the C library that gives Node everything V8 doesn't: the event
//    loop, timers, TCP and UDP, file system access, child processes, signals,
//    and a thread pool. It exists because 'wait for many things at once' has a
//    different API on every operating system — epoll on Linux, kqueue on the
//    BSDs and macOS, IOCP on Windows — and libuv puts one interface over all
//    of them.
//
//    The thing I actually use day to day is that libuv has two completely
//    different mechanisms and you have to know which one you're on. Sockets,
//    pipes and TTYs go to the kernel's readiness notifier, so the kernel does
//    the waiting and the cost of one more concurrent connection is basically
//    zero — that's why Node handles thousands of them. But file I/O, DNS
//    lookups via dns.lookup, zlib, and the slow crypto functions have no
//    portable async syscall, so libuv fakes them with a thread pool of four.
//    Fire eight pbkdf2 calls and you can watch four finish, then the other
//    four — I've measured exactly that.
//
//    That distinction decides the fix. If a file-heavy or gzip-heavy service
//    degrades in steps as concurrency rises, UV_THREADPOOL_SIZE is the knob —
//    read once at startup, so it has to be set before anything touches the
//    pool. If it's socket-bound, that knob does nothing and the problem is
//    almost always my own JavaScript blocking the loop. And if it's CPU-bound,
//    neither helps: that's Worker Threads or cluster.
//
//    The other half I'd mention is handles versus requests. A handle — a
//    timer, a listening server, a socket — keeps the loop alive by default,
//    and that's the entire explanation for both 'why does an http server not
//    exit' and 'why does my test suite hang after the tests pass'. unref() is
//    the fix for the second one."
//
// Leading with "V8 gave Node a language, libuv gave it an operating system"
// and closing with the two-mechanisms diagnosis is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is the event loop in V8 or in libuv?
// A1. libuv. V8 only owns the microtask queue, and even then the host decides
//     when it drains. → file 01 §9, file 05.
//
// Q2. How big is the thread pool, and what uses it?
// A2. Four by default. fs, dns.lookup, zlib, and pbkdf2/scrypt/randomBytes/
//     generateKeyPair.
//
// Q3. Do TCP sockets use the thread pool?
// A3. No. epoll/kqueue/IOCP. That is why socket concurrency scales and pool
//     concurrency does not.
//
// Q4. Why does file I/O need threads at all?
// A4. Because POSIX has no reliable async file API. O_NONBLOCK does not work
//     for regular files; AIO is limited and inconsistent. io_uring is changing
//     this on modern Linux, and libuv is adopting it incrementally.
//
// Q5. How do you change the pool size, and what is the catch?
// A5. UV_THREADPOOL_SIZE, max 1024, read once when the pool is first created.
//     Setting it after your first fs call silently does nothing.
//
// Q6. Would raising it help a service that is slow under load?
// A6. Only if the slowness is pool work. Diagnose first: file/dns/zlib/crypto
//     → yes; sockets or CPU-in-JS → no.
//
// Q7. What is the difference between a handle and a request?
// A7. A handle is long-lived and keeps the loop alive (timer, server, socket).
//     A request is a single operation that completes and is gone.
//
// Q8. My process will not exit. How do you find out why?
// A8. process.getActiveResourcesInfo(), or why-is-node-running. Then unref()
//     or close the handle.
//
// Q9. Does dns.resolve use the thread pool?
// A9. No — that is c-ares doing real DNS over the network, so it is socket
//     I/O. dns.lookup DOES use the pool, because it calls getaddrinfo.
//
// Q10. Where do Worker Threads fit?
// A10. Each worker is a real OS thread with its own V8 isolate AND its own
//      libuv loop. They do not share the main thread's loop, but by default
//      they DO share the process-wide thread pool. → file 06.
//
// Q11. Does async/await make anything concurrent by itself?
// A11. No. It is V8 syntax over promises. Concurrency comes from libuv doing
//      the work elsewhere. Await a sync function and nothing moves. → §8.
//
// Q12. What is io_uring and why do people bring it up here?
// A12. A Linux interface for genuinely async file I/O. It is the long-term
//      escape from "file I/O means threads", and libuv has been adding
//      support for it since 1.45.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is libuv, in one line?
//   Back : Node's operating system — event loop, thread pool, and portable
//          async I/O.
//
// Flashcard 2:
//   Front: The two mechanisms?
//   Back : Kernel readiness (epoll/kqueue/IOCP) for sockets; a 4-thread pool
//          for files, dns.lookup, zlib and slow crypto.
//
// Flashcard 3:
//   Front: Default thread pool size, and the cap?
//   Back : 4. Max 1024. UV_THREADPOOL_SIZE, read once at startup.
//
// Flashcard 4:
//   Front: Handle vs request?
//   Back : Handle = long-lived, keeps the loop alive. Request = one operation,
//          then gone.
//
// Flashcard 5:
//   Front: Why won't my process exit?
//   Back : A referenced handle. Find it with getActiveResourcesInfo(); fix it
//          with unref() or close().
//
// Flashcard 6:
//   Front: dns.lookup vs dns.resolve?
//   Back : lookup = getaddrinfo = thread pool. resolve = c-ares = network.
//
// Flashcard 7:
//   Front: Does raising UV_THREADPOOL_SIZE help socket throughput?
//   Back : No. Sockets never touch the pool.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "First I'd work out whether it's socket I/O, pool I/O, or CPU —
//          the three have three different fixes and only one shared symptom."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Change §5 from 8 tasks to 12 and predict the wave boundaries before
//   running it. Then run it.
//
// Task 2:
//   Re-run the whole file with UV_THREADPOOL_SIZE=1 and then =8. Watch §5's
//   bars change shape and §6's stay flat.
//
// Task 3:
//   Set process.env.UV_THREADPOOL_SIZE = "8" as the first line of a script,
//   then do an fs.readFile, then run the §5 test. Confirm it works. Now move
//   the assignment to AFTER the readFile and confirm it silently does not.
//
// Task 4:
//   Replace pbkdf2 with fs.readFile of a large file. Same waves? Now replace
//   it with dns.lookup("localhost"). Same waves?
//
// Task 5:
//   Write a script that creates a setInterval and never clears it. Run it.
//   Then add .unref() and watch it exit. Then log getActiveResourcesInfo()
//   in both versions.
//
// Task 6:
//   Start an http server, then call process.exit() inside the request handler
//   right after res.end(). Watch responses truncate.
//
// Task 7:
//   Run §8's sync loop with a 1 ms interval AND an http server up. Curl the
//   server during the loop and time the response.
//
// Task 8:
//   Take a service you have. For each slow path, write down which of the three
//   mechanisms it is on. That table IS the performance plan.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   libuv is Node's operating system, and it has two mechanisms — the kernel
//   for sockets, four threads for everything else. Which one you are on
//   determines every answer you will give about performance.
//
// If you remember the common bug:
//   Concurrency that plateaus in steps of four. That is the pool, and no
//   amount of `await` will widen it.
//
// If you remember the professional framing:
//   "Async" in Node is not one thing. It is "the kernel is watching this for
//   me", "a thread is doing this for me", or "I lied and it is running right
//   here on the main thread". Naming which one is the whole skill.
//
// NEXT TOPIC -> 03_event-loop-in-node-vs-browser.js


// ── run the async sections in order, then assert ───────────────────
(async function main() {
  await section4();
  await section5();
  await section6();
  section7();
  section8();
  assertions();
  server.close();
})();
