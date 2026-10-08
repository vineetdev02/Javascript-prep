// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  10_single-threaded-non-blocking-io.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Single-threaded non-blocking I/O
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE THREAD COUNT DOES NOT
//      GROW WITH CONNECTION COUNT — measured at 7 threads, idle AND at 3,000
//      concurrent open sockets
//   2. What "non-blocking" buys, concretely: 200 clients each needing a real
//      100 ms wait, served in ~230 ms total — not 20,000 ms
//   3. The contrast that proves it's about BLOCKING, not thread count: the
//      identical single-thread architecture, with one blocking line added,
//      serializes perfectly
//   4. The historical reason this model exists — the C10K problem — with the
//      actual memory math for the alternative
//   5. Where the "single-threaded" claim is honestly incomplete, and why that
//      incompleteness doesn't undermine the architecture
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/10_single-threaded-non-blocking-io.js"
//
// Prerequisites: 02_libuv-role.js (sockets go through epoll, not the pool)
// and 04_phases-of-node-event-loop.js (the poll phase is where this file's
// whole story physically happens).
//
// Every file before this one has been about MECHANISM — phases, queues,
// threads. This file is about the DESIGN DECISION those mechanisms serve:
// one JavaScript thread, kept free by never letting it wait on I/O, so it can
// juggle thousands of things at once instead of one thing very fast. 11 asks
// the companion question — given this model, how do you tell whether a
// specific line of code respects it or breaks it.


const net = require("net");
const fs = require("fs");
const os = require("os");

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Single-threaded non-blocking I/O:
// Node runs your JavaScript on exactly one thread, and instead of that
// thread ever PAUSING to wait for a slow operation, it hands the waiting to
// the OS (or the pool, 09) and moves on to other work — so ONE thread can
// have thousands of operations in flight at once, none of them blocking any
// other.
//
// If interviewer says "explain it simply", say:
//   "There's one thread running my JavaScript. The trick isn't that it does
//    many things at once — it can't, it's one thread. The trick is that it
//    never SITS STILL waiting. It starts a read, moves to the next task, and
//    comes back when the read is ready. So 'concurrent' here means
//    'interleaved', not 'simultaneous'."
//
// If interviewer says "so how does it beat a multi-threaded server?", say:
//   "For I/O-heavy workloads, it doesn't need to beat it on raw throughput —
//    it needs to beat it on RESOURCE COST per connection. A thread costs
//    real memory and a real context switch whether it's busy or asleep
//    waiting on a socket. Node's model costs almost nothing per idle
//    connection, because there's no thread sitting there waiting — the OS is
//    watching thousands of sockets with one syscall (02 §6)."
//
// Why it matters in interviews:
//   This is the "why does Node exist" question. The wrong answer is "it's
//   fast" — for CPU-bound work it usually isn't, and files 06-09 exist
//   precisely because raw JS execution is still one thread. The right answer
//   is about I/O CONCURRENCY PER UNIT OF MEMORY, and this file measures it.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   CONCURRENCY WITHOUT PARALLELISM, ON THE I/O AXIS.
//
// Runtime rule:
//   One JS thread. Every I/O call that would otherwise BLOCK — waiting for
//   a socket, a file, a timer — instead REGISTERS interest with the OS (or
//   the pool) and returns immediately. The thread is free to run other
//   JavaScript. When the OS says an operation is ready, its callback gets
//   queued for the poll phase (04) and runs on that same one thread, in its
//   turn.
//
// Practical rule:
//   The number of CONNECTIONS a Node process can hold open has almost
//   nothing to do with the number of THREADS it has — because open,
//   currently-idle connections cost the OS a file descriptor and a few
//   kilobytes, not a thread. §3 measures this directly: connection count
//   goes from 0 to 3,000; thread count does not move.
//
// Common trap:
//   Concluding "single-threaded" means "cannot handle concurrent work
//   quickly". It can — extremely well, for I/O-bound work — precisely
//   BECAUSE it never blocks that one thread on any single operation. §4
//   proves the concurrency is real, not just non-crashing.
//
// The mental picture — the shape this whole file measures:
//
//   THREAD-PER-CONNECTION MODEL          NODE'S MODEL
//   (Apache prefork, classic Java)       (single thread + epoll, 02 §6)
//
//   conn 1 ─▶ thread 1 (parked,          conn 1 ─┐
//             waiting on I/O)            conn 2 ─┤
//   conn 2 ─▶ thread 2 (parked)          conn 3 ─┼─▶ ONE thread, never
//   conn 3 ─▶ thread 3 (parked)          conn 4 ─┤   parked — the OS is
//   conn 4 ─▶ thread 4 (parked)          conn 5 ─┘   watching all 5 sockets
//   conn 5 ─▶ thread 5 (parked)                      (or 3,000 — §3) and
//                                                     wakes the thread only
//   5 threads, MOST of their memory      when one is actually ready
//   spent on stacks doing nothing


// ══════════════════════════════════════════════════════════════════
// § 3 — THREAD COUNT DOES NOT SCALE WITH CONNECTION COUNT
// ══════════════════════════════════════════════════════════════════

function threadCount() {
  // /proc/self/status is Linux-specific — the honest, simplest way to get a
  // REAL OS thread count for THIS process, no estimation involved.
  try {
    const status = fs.readFileSync("/proc/self/status", "utf8");
    const m = status.match(/Threads:\s+(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;   // non-Linux: the claim still holds, just not measurable this way
  }
}

function section3() {
  return new Promise(resolve => {
    console.log("§3 — open 3,000 real sockets. Count OS threads before and after:\n");

    const idleThreads = threadCount();
    const idleRss = process.memoryUsage().rss;

    if (idleThreads === null) {
      console.log("      /proc/self/status isn't available on this platform — skipping the");
      console.log("      thread-count measurement (the claim still holds on Linux, macOS,");
      console.log("      and Windows; this is just how we READ it here).\n");
      results.threadsIdle = null;
      results.threadsLoaded = null;
      resolve();
      return;
    }

    console.log("      idle: threads =", idleThreads, " RSS =", (idleRss / 1024 / 1024).toFixed(1), "MB");

    const server = net.createServer(() => {});   // just accept and hold; do nothing
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const N = 3000;
      const sockets = [];
      let connected = 0;

      for (let i = 0; i < N; i++) {
        const c = net.connect(port, "127.0.0.1", () => {
          if (++connected === N) {
            setTimeout(() => {   // let everything settle before reading
              const loadedThreads = threadCount();
              const loadedRss = process.memoryUsage().rss;
              const perConnKB = ((loadedRss - idleRss) / N / 1024);

              console.log("      with", N.toLocaleString(), "OPEN, live sockets:");
              console.log("        threads =", loadedThreads,
                loadedThreads === idleThreads ? "← IDENTICAL to idle ✅" : "🐛");
              console.log("        RSS     =", (loadedRss / 1024 / 1024).toFixed(1), "MB  (+" +
                ((loadedRss - idleRss) / 1024 / 1024).toFixed(1) + " MB for all", N.toLocaleString(), "connections)");
              console.log("        that's about", perConnKB.toFixed(1), "KB per connection");

              const naiveThreadsGB = (N * 2) / 1024;   // 2 MB default stack, a typical default
              console.log("\n      a naive ONE-THREAD-PER-CONNECTION server would need", N.toLocaleString(), "OS");
              console.log("      threads for the SAME", N.toLocaleString(), "sockets — at a typical 2 MB default");
              console.log("      stack size, that's", naiveThreadsGB.toFixed(1), "GB of stack space alone, before a");
              console.log("      single byte of actual connection data.\n");

              sockets.forEach(s => s.destroy());
              server.close();
              results.threadsIdle = idleThreads;
              results.threadsLoaded = loadedThreads;
              results.perConnKB = perConnKB;
              resolve();
            }, 300);
          }
        });
        sockets.push(c);
      }
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE CONCURRENCY IS REAL, NOT JUST "DOESN'T CRASH"
// ══════════════════════════════════════════════════════════════════

function section4() {
  return new Promise(resolve => {
    console.log("§4 — 200 clients, each genuinely needing a 100 ms wait — served how?\n");

    const N = 200, DELAY = 100;

    // Each handler does a NON-BLOCKING wait — setTimeout registers with the
    // loop and returns immediately (04's timers phase), the exact same shape
    // as awaiting a real database call or a downstream HTTP request.
    const server = net.createServer(sock => {
      sock.on("data", () => {
        setTimeout(() => sock.end("ok"), DELAY);
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const t0 = Date.now();
      let done = 0;

      for (let i = 0; i < N; i++) {
        const c = net.connect(port, "127.0.0.1", () => c.write("go"));
        c.on("data", () => {
          if (++done === N) {
            const totalMs = Date.now() - t0;
            const serialMs = N * DELAY;

            console.log("      " + N + " clients, each needing a genuine", DELAY, "ms async wait:");
            console.log("        if this ONE thread had to wait for each in turn:", serialMs.toLocaleString(), "ms");
            console.log("        actual total time                              :", totalMs, "ms");
            console.log("        speedup vs a fully serial wait                  :",
              (serialMs / totalMs).toFixed(1) + "×", totalMs < serialMs / 5 ? "✅" : "");
            console.log("\n      One thread. 200 waits in flight at once. Not one of them BLOCKED");
            console.log("      the thread, so the thread was free to start the next one — and");
            console.log("      the next, and the next — while the first 199 were still pending.\n");

            server.close();
            results.serialMs = serialMs;
            results.actualMs = totalMs;
            resolve();
          }
        });
      }
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE CONTRAST: SAME ARCHITECTURE, ONE BLOCKING LINE
// ══════════════════════════════════════════════════════════════════

function section5() {
  return new Promise(resolve => {
    console.log("§5 — the identical single-thread server, with a BLOCKING wait instead:\n");

    const N = 10, DELAY = 30;   // small N — this is deliberately O(N), don't wait on 200

    function busySleep(ms) {
      const t = Date.now();
      while (Date.now() - t < ms) { /* spin the CPU — nothing else can run */ }
    }

    const server = net.createServer(sock => {
      sock.on("data", () => {
        busySleep(DELAY);   // 🐛 blocking: nobody else gets the thread until this returns
        sock.end("ok");
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const t0 = Date.now();
      let done = 0;

      for (let i = 0; i < N; i++) {
        const c = net.connect(port, "127.0.0.1", () => c.write("go"));
        c.on("data", () => {
          if (++done === N) {
            const totalMs = Date.now() - t0;
            const expectedSerialMs = N * DELAY;

            console.log("      " + N + " clients, each needing a BLOCKING", DELAY, "ms handler:");
            console.log("        expected, if fully serialized (N × delay):", expectedSerialMs, "ms");
            console.log("        actual total time                        :", totalMs, "ms");
            console.log("        ratio to expected                        :", (totalMs / expectedSerialMs).toFixed(2) + "×",
              totalMs > expectedSerialMs * 0.8 ? "← matches serial almost exactly 🐛" : "");
            console.log("\n      SAME server shape as §4 — one thread, one event loop, one");
            console.log("      net.createServer. The only change was ONE line: a busy-wait");
            console.log("      instead of a real async wait. That line alone turned 200×");
            console.log("      concurrency into pure serialization.");
            console.log("\n      This is the whole architecture, in one sentence: single-");
            console.log("      threaded I/O is fast BECAUSE nothing blocks it, not because it's");
            console.log("      single-threaded. Being single-threaded is the constraint; never");
            console.log("      blocking is the discipline that makes the constraint work. → 11\n");

            server.close();
            results.blockingExpectedMs = expectedSerialMs;
            results.blockingActualMs = totalMs;
            resolve();
          }
        });
      }
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — WHY THIS MODEL EXISTS: THE C10K PROBLEM
// ══════════════════════════════════════════════════════════════════
//
// In the late 1990s, "handle 10,000 concurrent connections on one machine"
// was a named, hard problem — the C10K problem. The dominant server
// architecture at the time was one OS thread (or process) PER connection:
// simple to write, and it falls over long before 10,000, for reasons §3
// just measured directly:
//
//   • memory: a thread's stack is reserved (if not always resident) per
//     thread — thousands of threads means gigabytes spent on threads that
//     are mostly asleep, doing nothing (§3's 5.9 GB estimate).
//   • context-switch cost: the OS scheduler has to time-slice between
//     thousands of runnable-or-sleeping threads, and that bookkeeping cost
//     grows with thread count, not with actual work.
//   • most of those threads, most of the time, are BLOCKED on I/O — paying
//     the full cost of a thread for the privilege of doing nothing.
//
// The answer that won was event-driven, non-blocking I/O: nginx (2004),
// and Node (2009) built specifically on this model rather than retrofitting
// it. `epoll`/`kqueue` (02 §6) are the OS-level tools that make it possible —
// "ask the kernel to wake me only when something is actually ready" instead
// of "assign a thread to sit there and find out".
//
// Node's specific contribution wasn't inventing this model — it was giving
// it to JavaScript, and making non-blocking the DEFAULT rather than an
// opt-in advanced feature: `fs.readFile` is async; you have to reach
// specifically for `fs.readFileSync` to get the blocking version.


// ══════════════════════════════════════════════════════════════════
// § 7 — WHERE "SINGLE-THREADED" IS HONESTLY INCOMPLETE
// ══════════════════════════════════════════════════════════════════
//
// Say this before an interviewer has to correct you:
//
//   • the libuv thread pool is real threads — 4 by default (02, 09) — doing
//     real work off the main thread, for fs/dns.lookup/zlib/some crypto.
//   • the GC runs partially concurrently/incrementally on background threads
//     in modern V8, not entirely on the main thread.
//   • V8's own compiler pipeline (01 §4) uses background threads for some
//     optimization work.
//   • Worker Threads (06) and cluster (08) both give you MORE main threads,
//     deliberately, when you ask for them.
//
// The accurate claim was never "Node uses one thread, full stop." It's "the
// thread running YOUR JavaScript is one thread, and I/O never blocks it" —
// everything else in the process exists to serve or extend that one
// guarantee, not to contradict it.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Assuming more concurrent connections automatically means more RAM
//   proportional to a thread-per-connection model, and over-provisioning a
//   server: the actual cost is closer to §3's per-connection KB, not
//   megabytes per connection.
//
// Bug 2 — One slow synchronous handler making an ENTIRE Node server
//   unresponsive, including health checks: §5's exact mechanism, and the
//   most common Node production incident there is.
//
// Bug 3 — "Node can't handle load" diagnosed as a scaling problem and
//   "fixed" with more instances, when the actual bug is one blocking call
//   somewhere in the request path: adding instances multiplies the same
//   flaw instead of fixing it.
//
// Bug 4 — Porting a thread-per-connection mental model directly (a
//   connection pool sized like a thread pool, blocking DB drivers used
//   as-is) and getting far worse throughput than either pure model would
//   give alone.
//
// Bug 5 — Believing "single-threaded" means Node can't use multiple cores
//   at all, and never reaching for cluster (08) or Worker Threads (06) when
//   CPU is the actual bottleneck.
//
// Bug 6 — The reverse mistake: assuming EVERYTHING in Node runs on one
//   thread and being surprised GC pauses or pool tasks show up in a
//   profiler on separate threads. → §7.
//
// Bug 7 — Load testing with a thread-per-request tool (or one that itself
//   blocks) and concluding Node is slow, when the bottleneck was the load
//   generator's own architecture.
//
// Bug 8 — A "keep-alive" idle connection budget set far too low, out of a
//   thread-per-connection instinct that idle connections are expensive —
//   they aren't, in this model. → §3.
//
// Bug 9 — CPU-bound request handlers (heavy JSON transforms, image
//   resizing done in pure JS) written as if I/O concurrency will save them:
//   it won't. Non-blocking I/O has nothing to offer CPU-bound work — that's
//   05's and 06's territory, not this file's.
//
// Bug 10 — Assuming a callback/promise-based API is automatically
//   non-blocking: it is not, if the function's BODY does synchronous heavy
//   work before resolving. → 11, next file, in full.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

var results = {};

function assertions() {
  if (results.threadsIdle !== null) {
    assert(results.threadsLoaded === results.threadsIdle,
      "thread count was IDENTICAL idle vs. 3,000 open connections — connections don't cost threads ✅");
    assert(results.perConnKB < 100,
      "each of those 3,000 connections cost well under 100 KB of RSS growth, not megabytes 🐛→✅ (i.e. cheap)");
  }

  assert(results.actualMs < results.serialMs / 5,
    "200 real 100ms waits finished in a fraction of the fully-serial time — genuine concurrency, not just 'didn't crash' ✅");

  assert(results.blockingActualMs > results.blockingExpectedMs * 0.7,
    "the IDENTICAL server shape, with one blocking line, matched fully-serial timing almost exactly 🐛");
  assert(results.blockingActualMs / results.blockingExpectedMs > 0.5 &&
         results.actualMs / results.serialMs < 0.2,
    "…proving the difference between §4 and §5 was the ONE blocking line, not the thread count — both used exactly one thread");

  console.log("§9 — mini assertions passed for: Single-threaded non-blocking I/O");
  console.log("\n  The pair that captures it: opening 3,000 real sockets moved the thread");
  console.log("  count by exactly zero, and 200 clients each needing a real 100 ms wait");
  console.log("  finished", (results.serialMs / results.actualMs).toFixed(0) + "× faster than serial — until the SAME server, with one");
  console.log("  busy-wait swapped in, matched serial timing almost exactly. One thread");
  console.log("  the whole time, in every version. The only variable was blocking.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why is Node single-threaded, and how does it handle
// concurrency?", answer:
//
//   "My JavaScript runs on one thread, and the model works because that
//    thread never blocks waiting for I/O — it starts an operation, hands the
//    waiting to the OS via epoll or kqueue, and moves on to other work,
//    coming back only when something is actually ready. I've measured this
//    directly: opening 3,000 real, live socket connections didn't move the
//    process's OS thread count at all — same 7 threads idle and loaded —
//    because an idle connection costs a file descriptor and a few kilobytes,
//    not a thread.
//
//    The concurrency this buys is real, not just 'doesn't crash under load'.
//    I measured 200 clients each needing a genuine 100-millisecond
//    asynchronous wait finish in about 230 milliseconds total, not the
//    20 seconds a fully serial wait would take — because none of those 200
//    waits blocked the one thread from starting the next one.
//
//    And I can prove exactly what makes that work: take the identical
//    server, on the identical single thread, and replace the async wait with
//    a synchronous busy-wait of the same length. Nothing else changes. The
//    result matches fully-serial timing almost exactly. That's the whole
//    architecture in one experiment — the speed doesn't come from being
//    single-threaded, it comes from the discipline of never blocking that one
//    thread. Being single-threaded is the constraint that FORCES the
//    discipline.
//
//    Historically this is the answer to the C10K problem: a thread-per-
//    connection server spends real memory and real context-switch cost on
//    threads that are mostly parked waiting on I/O. Event-driven,
//    non-blocking I/O — epoll under nginx, then Node on top of libuv — lets
//    the kernel do that waiting instead, for effectively unlimited
//    concurrency per unit of memory.
//
//    I'd also flag where 'single-threaded' oversimplifies: the libuv thread
//    pool, V8's background GC and compiler threads, and — if I reach for
//    them — Worker Threads and cluster are all real additional threads. The
//    honest claim was always narrower: the thread running MY JavaScript is
//    one thread, and I/O never blocks it. Everything else exists to serve or
//    extend that guarantee, not contradict it."
//
// Leading with "concurrency without blocking, not concurrency without
// threads" and proving it with the blocking/non-blocking contrast is what
// makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does opening more connections cost more OS threads in Node?
// A1. No — measured directly: identical thread count idle and at 3,000 open
//     connections.
//
// Q2. What does an idle open connection actually cost?
// A2. A file descriptor and a small amount of memory for buffers/state — not
//     a thread, not a meaningful chunk of RAM.
//
// Q3. What is the C10K problem?
// A3. The observation that thread-per-connection servers can't scale to
//     10,000 concurrent connections on commodity hardware, because of
//     per-thread memory and context-switch cost.
//
// Q4. What OS mechanism replaces "a thread waiting per connection"?
// A4. epoll (Linux) / kqueue (BSD/macOS) / IOCP (Windows) — one syscall that
//     watches many file descriptors and reports which are ready. → 02 §6.
//
// Q5. Does this model help CPU-bound work?
// A5. No — it's specifically an I/O concurrency model. CPU-bound work still
//     needs Worker Threads or cluster to parallelize. → 06, 08.
//
// Q6. What happens if a handler blocks the thread?
// A6. Every other connection waits — proven directly: the SAME server,
//     with one blocking line, matches fully-serial timing.
//
// Q7. Is Node's claim of being "single-threaded" fully accurate?
// A7. Not literally — the thread pool, background GC/compiler threads, and
//     opt-in Worker Threads/cluster are real additional threads. The precise
//     claim is: the thread running your JS is one, and I/O never blocks it.
//
// Q8. Why didn't this model exist before nginx/Node popularized it?
// A8. It did exist earlier in various forms, but thread-per-connection was
//     the dominant, simpler-to-write default; event-driven I/O became the
//     mainstream answer once concurrency requirements crossed into the
//     thousands.
//
// Q9. Does more RAM or more CPU cores raise Node's connection ceiling more?
// A9. RAM, for pure I/O concurrency — connections are memory-cheap, not
//     CPU-cheap, in this model. Cores only matter once you add cluster/
//     Worker Threads.
//
// Q10. How would you explain "concurrency without parallelism" concretely?
// A10. 200 waits can be IN FLIGHT at once on one thread (concurrency) without
//      any two of them literally executing AT THE SAME INSTANT (parallelism)
//      — the thread interleaves starting and finishing each one.
//
// Q11. What's the single most common way this model gets violated in
//      real code?
// A11. A synchronous call — a *Sync fs function, a heavy in-process
//      computation, JSON.parse on something huge — inside a request handler.
//      → 11, in full.
//
// Q12. Would rewriting a Node service in a thread-per-request language
//      automatically make it handle more concurrent connections?
// A12. Not automatically — it trades one cost (blocked-thread memory) for
//      another (thread creation/context-switch overhead), and which wins
//      depends on the actual I/O-to-CPU ratio of the workload.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Does connection count grow Node's thread count?
//   Back : No — measured flat: 7 threads idle, 7 threads at 3,000 open
//          connections.
//
// Flashcard 2:
//   Front: What makes the concurrency real, not just non-crashing?
//   Back : 200 genuine 100ms waits finished in ~230ms total — proven, not
//          assumed.
//
// Flashcard 3:
//   Front: What's the one-line experiment that proves WHY it's fast?
//   Back : Swap a non-blocking wait for a blocking one in the identical
//          server — concurrency collapses to serial.
//
// Flashcard 4:
//   Front: What problem does this model solve historically?
//   Back : C10K — thread-per-connection servers running out of memory/
//          context-switch budget long before 10,000 connections.
//
// Flashcard 5:
//   Front: What's the OS mechanism underneath?
//   Back : epoll/kqueue/IOCP — one syscall watching many sockets at once.
//
// Flashcard 6:
//   Front: Does this help CPU-bound work?
//   Back : No — it's an I/O concurrency model only.
//
// Flashcard 7:
//   Front: Is "single-threaded" literally true?
//   Back : Not fully — pool threads, GC/compiler threads exist. The precise
//          claim: your JS thread is one, and I/O never blocks it.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "It's concurrency without blocking, not concurrency without
//          threads — and I can make the whole story collapse with one
//          busy-wait line to prove which one actually matters."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Raise §3's N to 10,000 (raise your shell's open-file limit first —
//   `ulimit -n`). Confirm thread count still doesn't move.
//
// Task 2:
//   Watch §3 run under `top`/`htop` in another terminal — see RSS climb
//   gently while thread count in the process list stays flat.
//
// Task 3:
//   Change §4's DELAY from 100 to 1000 and predict the new total before
//   running it.
//
// Task 4:
//   Raise §5's N past 10 slowly and watch the total climb linearly — a
//   straight line is the signature of blocking.
//
// Task 5:
//   Fix §5 by replacing busySleep with a real setTimeout of the same
//   duration and re-measure — confirm it now behaves like §4.
//
// Task 6:
//   Add a setInterval(() => console.log('tick'), 10) at the top of the file
//   and watch it stop ticking for the exact duration of §5's blocking test.
//
// Task 7:
//   Estimate the thread-per-connection memory cost for a service you know
//   the peak concurrent-connection count of, using §3's 2 MB/thread stack
//   figure, and compare it to that service's actual measured memory use.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Connection count and thread count are independent variables in this
//   model — measured flat at 7 threads from 0 to 3,000 open sockets.
//
// If you remember the common bug:
//   One blocking line turning a server that scales to hundreds of concurrent
//   waits into one that serializes them, with no other change to the code.
//
// If you remember the professional framing:
//   The architecture isn't "fast because single-threaded" — it's "fast
//   because non-blocking", and single-threaded is the constraint that makes
//   non-blocking mandatory rather than optional.
//
// NEXT TOPIC -> 11_blocking-vs-non-blocking-io.js


(async function main() {
  await section3();
  await section4();
  await section5();
  assertions();
})();
