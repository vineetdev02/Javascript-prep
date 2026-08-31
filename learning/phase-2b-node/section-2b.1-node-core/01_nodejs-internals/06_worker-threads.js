// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  06_worker-threads.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Worker Threads
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A WORKER IS A REAL OS
//      THREAD WITH ITS OWN V8 ISOLATE — separate heap, separate stack,
//      separate event loop
//   2. Why CPU-bound work gets faster and I/O-bound work does not
//   3. Message passing is a COPY (structured clone), proved by mutating a
//      "shared-looking" global that never actually moves
//   4. Transferable objects — a real zero-copy handoff, and the sender loses
//      the buffer to prove it really moved
//   5. SharedArrayBuffer + Atomics: real shared memory, and the exact race
//      condition you get without Atomics
//   6. A worker crashing does NOT crash the process — proved by watching the
//      main thread outlive it
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/06_worker-threads.js"
//
// Prerequisites: 01_v8-engine-role.js (one isolate = one heap + one stack),
// 02_libuv-role.js (the thread pool vs the event loop), and
// 04_phases-of-node-event-loop.js (one loop per thread). This file is where
// "one loop per thread" from 03 §9 gets proven rather than stated.
//
// Every earlier file in this group has been about ONE thread — the main
// one — and the four threads UNDER it that you never touch directly (the
// libuv pool). Worker Threads are the other kind of thread: ones YOU spawn,
// each running its own complete copy of everything 01 described. This file
// is a single script that runs as both the main thread and its own workers —
// look for `isMainThread` splitting the file into two halves.


const {
  Worker, isMainThread, parentPort, workerData,
} = require("worker_threads");

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Worker Threads:
// A Node module that spawns a real OS thread, each running its own complete
// V8 isolate and its own libuv event loop, able to run actual JavaScript in
// parallel — communicating with the parent only by copying or transferring
// messages, never by sharing objects.
//
// If interviewer says "explain it simply", say:
//   "It's Node giving you real parallelism for JavaScript itself. The libuv
//    thread pool from file 02 runs C++ — fs calls, hashing — in parallel, but
//    your JS still executes on one thread. A Worker Thread runs YOUR
//    JavaScript on a second thread, with its own heap, so two CPU-bound
//    functions can genuinely run at the same time."
//
// If interviewer says "so is Node multi-threaded now?", say:
//   "The single-threaded-JS story was always about the MAIN thread. Worker
//    Threads have existed as a stable API since Node 12 for exactly the case
//    that story doesn't cover: CPU-bound work that would otherwise block
//    everything."
//
// Why it matters in interviews:
//   This is the answer to "Node is single-threaded, so how do you handle a
//   CPU-heavy task?" — and the wrong answers (cluster, more requests, "just
//   use async") all miss that CPU-bound work needs a second THREAD, not a
//   second queue.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE THREAD, ONE ISOLATE, ONE LOOP — MULTIPLIED, NOT SHARED.
//
// Runtime rule:
//   new Worker(...) starts a real OS thread. That thread gets its own V8
//   isolate (01 §2's whole left box, duplicated), its own call stack, its own
//   heap, its own GC, and its own libuv event loop (02's whole right box,
//   duplicated too). The only things NOT duplicated are the process itself
//   and — by default — the libuv thread pool (file 02's four threads, shared
//   process-wide unless you opt out).
//
// Practical rule:
//   Reach for a worker when the bottleneck is CPU IN YOUR JAVASCRIPT — image
//   processing, parsing, hashing you're doing yourself, heavy computation.
//   Do not reach for it for I/O: fs, network and the thread pool are already
//   async and already off the main thread (02). Adding a worker around an
//   fs.readFile buys nothing and costs a thread's worth of memory.
//
// Common trap:
//   Assuming postMessage "shares" data because it feels like passing a
//   reference. It does not. Every message is COPIED via the structured clone
//   algorithm — the same one behind postMessage in browsers and
//   structuredClone() in Phase 1's ES2024 file. §4 proves the copy.
//
// The mental picture:
//
//   MAIN THREAD                              WORKER THREAD
//   ┌─────────────────────┐                  ┌─────────────────────┐
//   │  V8 isolate          │                  │  V8 isolate          │
//   │   heap, stack, GC    │                  │   heap, stack, GC    │
//   │  libuv event loop    │                  │  libuv event loop    │
//   └──────────┬───────────┘                  └───────────┬──────────┘
//              │                                          │
//              │   worker.postMessage(x)                  │
//              ├─────────────────────────────────────────▶│  (x is CLONED,
//              │◀─────────────────────────────────────────┤   not shared)
//              │        parentPort.postMessage(y)          │
//              │                                          │
//   ┌──────────┴──────────────────────────────────────────┴──────────┐
//   │            shared libuv THREAD POOL (4, from file 02)           │
//   │            shared PROCESS (one process.exit() kills both)       │
//   └───────────────────────────────────────────────────────────────┘
//
//   The only real exception to "copy, not share" is a SharedArrayBuffer,
//   which is deliberately excluded from the clone and genuinely shared. §6.


// ══════════════════════════════════════════════════════════════════
// MAIN THREAD — everything below only runs in the parent
// ══════════════════════════════════════════════════════════════════

if (isMainThread) {

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
function countPrimes(from, to) {
  let c = 0;
  for (let i = from; i < to; i++) if (isPrime(i)) c++;
  return c;
}

const os = require("os");

// ── § 3 — CPU-bound work: measured single-threaded, then across workers ──

function section3() {
  return new Promise(resolve => {
    console.log("§3 — counting primes up to 3,500,000, one thread vs four:\n");

    const RANGE = 3_500_000;

    const t0 = Date.now();
    const singleResult = countPrimes(0, RANGE);
    const singleMs = Date.now() - t0;
    console.log("      single-threaded  :", singleMs, "ms  →", singleResult.toLocaleString(), "primes");

    const N = Math.min(4, os.cpus().length);
    const chunk = Math.ceil(RANGE / N);
    const t1 = Date.now();
    let sum = 0;
    const jobs = [];
    for (let i = 0; i < N; i++) {
      const from = i * chunk, to = Math.min((i + 1) * chunk, RANGE);
      jobs.push(new Promise(res => {
        const w = new Worker(__filename, { workerData: { kind: "primes", from, to } });
        w.on("message", msg => res(msg));
      }));
    }
    Promise.all(jobs).then(parts => {
      const parallelResult = parts.reduce((a, b) => a + b, 0);
      const parallelMs = Date.now() - t1;
      const speedup = singleMs / parallelMs;

      console.log("      " + N + " workers        :", parallelMs, "ms  →", parallelResult.toLocaleString(), "primes");
      console.log("      speedup           :", speedup.toFixed(2) + "×",
        speedup > 1.3 ? "✅ genuine parallelism" : "(this machine has few cores — see the note below)");
      console.log("      same answer both ways:", singleResult === parallelResult);
      console.log("\n      This only works because prime-counting is CPU-bound and the");
      console.log("      chunks are independent. Spawning workers has a real cost — a");
      console.log("      new isolate, a new loop, thread creation — which is why the");
      console.log("      speedup is well under " + N + "×, not a clean " + N + "×. Workers pay for");
      console.log("      themselves on WORK, not on latency.\n");

      results.singleMs = singleMs;
      results.parallelMs = parallelMs;
      results.singleResult = singleResult;
      results.parallelResult = parallelResult;
      resolve();
    });
  });
}

// ── § 4 — message passing is a COPY, never a share ──

function section4() {
  return new Promise(resolve => {
    console.log("§4 — mutate an object in the worker. Watch the main thread NOT see it:\n");

    const before = { count: 0 };
    const w = new Worker(__filename, { workerData: { kind: "mutate", obj: before } });

    w.on("message", workerFinalCount => {
      console.log("      main's own object.count   :", before.count, "← never touched. It was never sent BACK,");
      console.log("                                    and the one that WAS sent was a COPY going in");
      console.log("      worker's object.count     :", workerFinalCount, "← the worker mutated its own clone");
      console.log("\n      workerData didn't hand the worker a reference to `before`. It ran");
      console.log("      the structured clone algorithm — same one as structuredClone()");
      console.log("      (Phase 1, ES2024 file) and browser postMessage — and the worker");
      console.log("      got an independent object that happens to start out equal.");
      console.log("\n      This is why two workers processing 'the same array' in place");
      console.log("      never see each other's writes: there is no 'the same array'.");
      console.log("      There are N clones. For genuine sharing you need §6.\n");

      results.mutateBefore = before.count;
      results.mutateAfter = workerFinalCount;
      resolve();
    });
  });
}

// ── § 5 — transferable objects: an actual zero-copy move ──

function section5() {
  return new Promise(resolve => {
    console.log("§5 — the one escape from cloning: transfer, don't copy:\n");

    const buf = new ArrayBuffer(8 * 1024 * 1024);              // 8 MB
    const beforeLen = buf.byteLength;

    const w = new Worker(__filename, {
      workerData: { kind: "transfer", buf },
      transferList: [buf],                                    // ← the opt-in
    });

    const afterLen = buf.byteLength;                           // measured RIGHT after construction

    w.on("message", workerSawLen => {
      console.log("      buf.byteLength BEFORE transferList  :", beforeLen.toLocaleString());
      console.log("      buf.byteLength AFTER (still in main) :", afterLen, "← detached. It is genuinely gone here.");
      console.log("      buf.byteLength as seen IN the worker :", workerSawLen.toLocaleString(), "← it actually arrived");
      console.log("\n      That is a real move, not a copy: the underlying memory changed");
      console.log("      OWNER instead of being duplicated. It costs O(1), not O(size) —");
      console.log("      the 8 MB did not get copied twice the way structured clone would.");
      console.log("\n      Only transferable types qualify: ArrayBuffer, MessagePort, and a");
      console.log("      few others (ImageBitmap in browsers). A plain object can never be");
      console.log("      transferred, only cloned — which is exactly why §4 came first.\n");

      results.beforeLen = beforeLen;
      results.afterLen = afterLen;
      results.workerSawLen = workerSawLen;
      resolve();
    });
  });
}

// ── § 6 — SharedArrayBuffer + Atomics: genuine shared memory ──

function section6() {
  return new Promise(resolve => {
    console.log("§6 — the actual exception to 'copy, never share', and its price:\n");

    const N_WORKERS = 4, PER_WORKER = 100_000;
    const EXPECTED = N_WORKERS * PER_WORKER;

    function race(useAtomics) {
      return new Promise(res => {
        const sab = new SharedArrayBuffer(4);
        const view = new Int32Array(sab);
        let done = 0;
        for (let i = 0; i < N_WORKERS; i++) {
          const w = new Worker(__filename, {
            workerData: { kind: useAtomics ? "increment-atomic" : "increment-unsafe", sab, times: PER_WORKER },
          });
          w.on("message", () => { if (++done === N_WORKERS) res(Atomics.load(view, 0)); });
        }
      });
    }

    (async () => {
      const unsafeResult = await race(false);
      const atomicResult = await race(true);

      console.log("      " + N_WORKERS + " workers × " + PER_WORKER.toLocaleString() + " increments to ONE SharedArrayBuffer cell:");
      console.log("        expected total                :", EXPECTED.toLocaleString());
      console.log("        plain  `view[0] = view[0] + 1`:", unsafeResult.toLocaleString(),
        unsafeResult < EXPECTED ? `← lost ${(EXPECTED - unsafeResult).toLocaleString()} increments 🐛` : "");
      console.log("        `Atomics.add(view, 0, 1)`      :", atomicResult.toLocaleString(),
        atomicResult === EXPECTED ? "✅ exact" : "🐛");
      console.log("\n      The memory really is shared this time — four separate threads");
      console.log("      wrote into the SAME four bytes, and the read/modify/write race is");
      console.log("      the classic multi-threading bug every other language has always");
      console.log("      had. JavaScript on a single thread never needed a mutex. A Worker");
      console.log("      Thread touching a SharedArrayBuffer genuinely does.");
      console.log("\n      This is the one place in all of Node where you can lose an");
      console.log("      update silently without an exception, a warning, or a stack trace.");
      console.log("      Reach for it only when the copying cost in §3/§4 is the actual");
      console.log("      bottleneck — most workloads should stay on postMessage.\n");

      results.unsafeResult = unsafeResult;
      results.atomicResult = atomicResult;
      results.expected = EXPECTED;
      resolve();
    })();
  });
}

// ── § 7 — a crashing worker does not crash the process ──

function section7() {
  return new Promise(resolve => {
    console.log("§7 — isolation cuts both ways: failure doesn't cross the boundary either:\n");

    let errored = false, exitCode = null, mainStillAlive = false;
    const w = new Worker(__filename, { workerData: { kind: "crash" } });

    w.on("error", (err) => {
      errored = true;
      console.log("      worker threw               :", err.message);
    });
    w.on("exit", (code) => {
      exitCode = code;
      mainStillAlive = true;
      console.log("      worker exit code            :", code);
      console.log("      main thread executing this line:", mainStillAlive, "✅ — an uncaught worker");
      console.log("        exception became an 'error' EVENT here, not a process crash");
      console.log("\n      Compare: an uncaught exception on the MAIN thread with no");
      console.log("      'uncaughtException' handler DOES crash the whole process — main");
      console.log("      thread failures are fatal by default, worker failures are not.");
      console.log("      That asymmetry is exactly why workers are a reasonable place to");
      console.log("      run untrusted or best-effort work: one bad job degrades, it");
      console.log("      doesn't take the server down. → group 2, http error handling.\n");

      results.errored = errored;
      results.exitCode = exitCode;
      results.mainStillAlive = mainStillAlive;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT WORKERS SHARE, AND WHAT THEY DO NOT
// ══════════════════════════════════════════════════════════════════
//
//   SEPARATE (one per worker)          SHARED (across the process)
//   ──────────────────────────         ───────────────────────────
//   V8 isolate                         the OS process itself
//   heap, GC                           the libuv thread pool (4, by default —
//   call stack                           can opt a worker out per-task)
//   event loop                         environment variables at spawn time
//   microtask queue                    a SharedArrayBuffer, if you pass one
//   module cache (require again        process.exit() — kills every worker
//     re-evaluates, doesn't reuse)     stdout/stderr (interleaved, not owned)
//
// The module-cache line is the one people miss: requiring the same file in
// two workers does not give you "the same module" the way two requires on
// one thread would. Each isolate re-parses and re-evaluates it. A singleton
// pattern (`let instance; module.exports = () => instance ??= new Thing()`)
// gives you one instance PER WORKER, not one for the process.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Wrapping an fs.readFile in a Worker Thread "for performance":
//   fs was already off the main thread via the libuv pool (02). The worker
//   adds isolate + thread overhead around work that was never blocking
//   anything. → §2, §3.
//
// Bug 2 — Data mutated in a worker "not showing up" in the main thread:
//   postMessage cloned it. There was never a shared object. → §4.
//
// Bug 3 — A "singleton" cache or config object that is empty/different in
//   every worker: the module cache is per-isolate. → §8.
//
// Bug 4 — Silent lost counts in a shared counter under load:
//   A SharedArrayBuffer written with plain `+=` instead of Atomics. → §6.
//
// Bug 5 — A worker pool that gets slower as you add workers:
//   More workers than cores, all CPU-bound, now context-switching instead of
//   parallel. Size the pool to os.cpus().length, not to queue depth.
//
// Bug 6 — process.exit() called from application code inside a worker,
//   killing the entire process instead of just that worker:
//   process.exit() is process-wide, not worker-scoped. Use
//   `process.exitCode` in a worker or just return/throw.
//
// Bug 7 — An uncaught exception in the MAIN thread assumed to behave like a
//   worker's: it does NOT degrade gracefully. It crashes the process unless
//   you have an 'uncaughtException' handler (and even then, resuming is
//   unsafe). → §7.
//
// Bug 8 — Passing a huge object with workerData on every task instead of
//   transferring or sharing it: paying the structured-clone cost repeatedly
//   for data that does not change. → §4, §5.
//
// Bug 9 — Trying to transfer a plain object and getting a silent full clone
//   instead: only ArrayBuffer/MessagePort/etc. are transferable. Objects are
//   always copied, transferList or not. → §5.
//
// Bug 10 — A worker pool leaking memory because idle workers are never
//   terminated: each one holds a full V8 isolate. Use a bounded pool (or
//   Node's own `Worker` + a queue) and call .terminate() when done.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

var results = {};

function assertions() {
  // Parallel CPU work:
  assert(results.singleResult === results.parallelResult,
    "single-threaded and multi-worker prime counts agree exactly");
  assert(results.parallelMs > 0 && results.singleMs > 0, "both variants were genuinely timed");

  // Copy, not share:
  assert(results.mutateBefore === 0,
    "the main thread's object was NEVER mutated — postMessage cloned it going in 🐛→✅");
  assert(results.mutateAfter === 999,
    "…while the worker's independent copy was mutated freely, with zero effect on main's");

  // Transfer:
  assert(results.beforeLen === 8 * 1024 * 1024, "an 8 MB buffer existed in main before transfer");
  assert(results.afterLen === 0,
    "…and was detached (byteLength 0) the moment it was handed to transferList 🐛→ by design");
  assert(results.workerSawLen === 8 * 1024 * 1024,
    "…while the worker received the FULL buffer — a move, not a copy ✅");

  // Shared memory needs Atomics:
  assert(results.unsafeResult < results.expected,
    "four threads doing plain read-modify-write on ONE shared cell lost updates 🐛");
  assert(results.unsafeResult > 0, "…but did not lose EVERY update — a classic partial race, not a crash");
  assert(results.atomicResult === results.expected,
    "the identical race, done with Atomics.add, landed on the exact expected total ✅");

  // Failure isolation:
  assert(results.errored === true, "the worker's uncaught throw surfaced as an 'error' EVENT");
  assert(results.exitCode === 1, "…and the worker exited with a non-zero code");
  assert(results.mainStillAlive === true,
    "…while the main thread kept running and got to log this itself 🐛→✅");

  console.log("§10 — mini assertions passed for: Worker Threads");
  console.log("\n  The pair that captures it: a plain \"view[0] = view[0] + 1\" race across");
  console.log("  4 real OS threads lost", (results.expected - results.unsafeResult).toLocaleString(), "of", results.expected.toLocaleString(), "increments, and Atomics.add on the");
  console.log("  exact same SharedArrayBuffer lost none — while a worker that MUTATED an");
  console.log("  ordinary object never touched the main thread's copy at all. Two");
  console.log("  completely different memory models, one API, and the difference is");
  console.log("  entirely about which one you deliberately opted into.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are Worker Threads and when would you use them?", answer:
//
//   "A Worker Thread is a real OS thread running its own complete V8 isolate —
//    its own heap, call stack, GC and event loop — so it can execute actual
//    JavaScript in parallel with the main thread. That's different from the
//    libuv thread pool from earlier: the pool runs C++ for things like fs and
//    hashing in parallel, but my own JavaScript still only ran on one thread
//    until Worker Threads existed.
//
//    So the decision rule is: is the bottleneck I/O, or is it CPU in my own
//    JS? I/O — file reads, network, most database drivers — is already
//    off-thread via libuv; wrapping it in a worker adds isolate overhead for
//    nothing. CPU-bound work — image processing, parsing, hashing I wrote
//    myself, heavy computation — is exactly what workers are for, and I've
//    measured real speedups splitting a prime-counting job across four of
//    them.
//
//    The part people get wrong is assuming postMessage shares data. It
//    doesn't — every message goes through the structured clone algorithm, the
//    same one behind structuredClone() and browser postMessage, and it's a
//    real copy. Mutate an object inside a worker and the main thread's
//    original is completely untouched; I've proven that directly. There are
//    exactly two ways around the copy: transferable objects — ArrayBuffers and
//    MessagePorts move ownership for free, and the sender's copy becomes
//    unusable, byteLength zero, as proof it really moved — and
//    SharedArrayBuffer, which is genuinely shared memory across threads.
//
//    SharedArrayBuffer is also where you can finally get a data race in
//    Node, which single-threaded JavaScript never had to worry about. I
//    measured four threads doing a plain read-modify-write on one shared
//    cell and losing thousands of increments; switching to Atomics.add fixed
//    it exactly. That's the one place you need to think about memory safety
//    like you would in a lower-level language.
//
//    And one more asymmetry worth stating: an uncaught exception in a worker
//    doesn't crash the process — it surfaces as an 'error' event and the
//    worker exits, while the main thread keeps running. An uncaught exception
//    on the main thread itself is fatal by default. That makes workers a
//    reasonable place to isolate risky or untrusted work, not just fast ones."
//
// Leading with "a real thread, not a queue" and closing with the failure-
// isolation asymmetry is what makes this sound like production experience.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does a Worker Thread duplicate, and what does it share?
// A1. Duplicates: isolate, heap, stack, event loop, module cache. Shares: the
//     process, the libuv thread pool (by default), env vars at spawn.
//
// Q2. Does postMessage share memory?
// A2. No — structured clone, a real copy, unless the value is transferred or
//     is a SharedArrayBuffer.
//
// Q3. What can be transferred instead of cloned?
// A3. ArrayBuffer, MessagePort, and a small set of others. Plain objects
//     never can be.
//
// Q4. What happens to the sender's buffer after a transfer?
// A4. It's detached — byteLength becomes 0. That IS the proof it moved.
//
// Q5. Why does SharedArrayBuffer need Atomics?
// A5. Because it's real shared memory across real threads — plain
//     read-modify-write on it is a genuine data race, unlike anything else in
//     single-threaded JS.
//
// Q6. Should I use a worker for an fs.readFile?
// A6. No. That's already off the main thread via libuv's pool. Workers are
//     for CPU-bound JS, not I/O.
//
// Q7. Does a worker crashing take down the process?
// A7. No — it emits 'error' and exits; the main thread and other workers keep
//     running. The main thread itself crashing on an uncaught exception is
//     the opposite default.
//
// Q8. Is a singleton module-level variable shared across workers?
// A8. No — each worker has its own module cache and its own copy.
//
// Q9. How many workers should a CPU-bound pool have?
// A9. Roughly os.cpus().length. More than that just adds context-switching
//     for no extra parallelism.
//
// Q10. Does process.exit() inside a worker kill just that worker?
// A10. No — it's process-wide and kills everything. Use process.exitCode or
//      just let the function return/throw.
//
// Q11. What's the difference between a Worker Thread and a child process?
// A11. A worker shares the process and (by default) the thread pool, and
//      talks via structured clone or SharedArrayBuffer — cheaper to spawn,
//      but a bug can still corrupt process-wide state like env vars. A child
//      process is fully isolated — separate memory space, separate crash
//      domain — and talks only via serialized IPC or stdio. → file 07.
//
// Q12. Would you ever combine cluster and Worker Threads?
// A12. Yes — cluster for spreading across CPU cores at the process level
//      (file 08), Worker Threads inside one of those processes for CPU-bound
//      work that shouldn't block that process's event loop.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does a Worker Thread give you that the libuv pool doesn't?
//   Back : Parallel execution of your own JavaScript — a real second isolate,
//          not just off-thread C++.
//
// Flashcard 2:
//   Front: Does postMessage share objects?
//   Back : No — structured clone. A real copy, every time, unless transferred
//          or shared explicitly.
//
// Flashcard 3:
//   Front: How do you move data without copying?
//   Back : transferList with a transferable type (ArrayBuffer, MessagePort).
//          The sender's copy is detached afterward.
//
// Flashcard 4:
//   Front: What's genuinely shared across workers?
//   Back : SharedArrayBuffer — and only that, plus the process and the
//          libuv pool.
//
// Flashcard 5:
//   Front: Why does SharedArrayBuffer need Atomics?
//   Back : Plain read-modify-write across real threads is a data race —
//          proven: 4 threads lost thousands of increments without it.
//
// Flashcard 6:
//   Front: Worker crash vs main thread crash?
//   Back : Worker: 'error' event, worker exits, main survives. Main:
//          uncaught exception is fatal by default.
//
// Flashcard 7:
//   Front: Worker Thread vs I/O — which needs one?
//   Back : CPU-bound JS needs a worker. I/O is already off-thread; wrapping
//          it adds overhead for nothing.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Copy by default, transfer for zero-copy moves, share only through
//          SharedArrayBuffer — and only the last one needs a mutex."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Raise §3's RANGE until single-threaded takes 10+ seconds. Watch the
//   speedup approach the core count as spawn overhead becomes proportionally
//   smaller.
//
// Task 2:
//   Add a fifth worker beyond os.cpus().length in §3 and compare timing.
//
// Task 3:
//   In §4, postMessage the mutated object back to main explicitly and confirm
//   THAT copy — sent deliberately — does show the mutation. The bug was never
//   sending it back, not cloning itself.
//
// Task 4:
//   Try to put buf in transferList a second time after §5 already transferred
//   it. Read the error.
//
// Task 5:
//   Rerun §6's unsafe race with PER_WORKER raised 10× and watch the lost-
//   update count scale with contention.
//
// Task 6:
//   Add a second worker crash scenario: throw inside an async function in the
//   worker (not synchronously) and confirm 'error' still fires the same way.
//
// Task 7:
//   Build a tiny worker pool: N workers, a task queue, round-robin dispatch,
//   and .terminate() when the queue empties. Time it against spawning a fresh
//   worker per task.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A worker is a real thread with its own isolate. Messages are copies by
//   default; only a SharedArrayBuffer is genuinely shared, and only that one
//   needs Atomics.
//
// If you remember the common bug:
//   Wrapping I/O in a worker (wasted overhead — it was already off-thread) or
//   mutating a SharedArrayBuffer without Atomics (a silent lost-update race).
//
// If you remember the professional framing:
//   Workers trade cheap thread-local isolation for the cost of copying data
//   across the boundary. Pay that cost for CPU-bound work; never pay it for
//   I/O that was already async.
//
// NEXT TOPIC -> 07_child-process.js


(async function main() {
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  assertions();
})();

} // end isMainThread


// ══════════════════════════════════════════════════════════════════
// WORKER THREAD — everything below only runs inside a spawned worker
// ══════════════════════════════════════════════════════════════════
//
// Every new Worker(__filename, ...) above re-runs this ENTIRE file from the
// top in a fresh isolate. `isMainThread` is false there, so the whole block
// above is skipped and only this branch executes — proof by itself that each
// worker gets its own complete pass through module scope. → §8's note on the
// module cache.

if (!isMainThread) {
  const { kind } = workerData;

  if (kind === "primes") {
    function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
    let c = 0;
    for (let i = workerData.from; i < workerData.to; i++) if (isPrime(i)) c++;
    parentPort.postMessage(c);

  } else if (kind === "mutate") {
    const obj = workerData.obj;      // an independent CLONE of main's object
    obj.count = 999;                 // mutating it does nothing to main's
    parentPort.postMessage(obj.count);

  } else if (kind === "transfer") {
    parentPort.postMessage(workerData.buf.byteLength);   // the buffer really arrived

  } else if (kind === "increment-unsafe") {
    const view = new Int32Array(workerData.sab);
    for (let i = 0; i < workerData.times; i++) view[0] = view[0] + 1;   // 🐛 not atomic
    parentPort.postMessage("done");

  } else if (kind === "increment-atomic") {
    const view = new Int32Array(workerData.sab);
    for (let i = 0; i < workerData.times; i++) Atomics.add(view, 0, 1);  // ✅ atomic
    parentPort.postMessage("done");

  } else if (kind === "crash") {
    throw new Error("deliberate crash to prove isolation");
  }
}
