// ╔══════════════════════════════════════════════════════════════════╗
// ║        NODE.JS INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Node.js Internals — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to Node Phase 2B, Section 2B.1 — Node Core. It is the
// FIRST group in Phase 2B, and the first group of the entire backend half of
// this curriculum. The other group in this section is ◆ Streams & Buffers,
// which lives in 02_streams-and-buffers/.
//
// Folder:
//   learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/
//
// Files:
// ├── index.js
// ├── 01_v8-engine-role.js
// ├── 02_libuv-role.js
// ├── 03_event-loop-in-node-vs-browser.js
// ├── 04_phases-of-node-event-loop.js
// ├── 05_process-nexttick-vs-setimmediate.js
// ├── 06_worker-threads.js
// ├── 07_child-process.js
// ├── 08_cluster-module.js
// ├── 09_thread-pool-libuv.js
// ├── 10_single-threaded-non-blocking-io.js
// ├── 11_blocking-vs-non-blocking-io.js
// ├── 12_streams-concept.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints. Every file in this group
//   re-execs itself as a child process, a Worker Thread, or a cluster worker
//   at least once — read the `isMainThread` / `cluster.isPrimary` /
//   `--flag` branches as carefully as the numbered sections; that's where
//   the actual measurement happens.
//
// READ IN ORDER:
//   These twelve are not a catalogue, they are one argument in four
//   movements. 01-02 draw the foundational boundary — what V8 owns, what
//   libuv owns — that every later file assumes. 03-05 are the event loop
//   itself, from three angles: Node vs the browser, the six phases, and the
//   two queues that aren't phases at all. 06-09 are the four ways Node gets
//   MORE than one thread of execution, and what each one actually costs.
//   10-12 step back to the two-word slogan — "non-blocking I/O" — and prove
//   both halves of it, plus the one place data itself needs the same trick
//   applied to size instead of time.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. V8 engine role — V8 runs JavaScript and NOTHING else. Hidden classes
//     turned a single line of code 4.7× slower with no other change.
// 02. libuv role — Node's operating system. ONE mechanism for sockets
//     (epoll, free), a DIFFERENT one for files/DNS/zlib/crypto (4 threads,
//     not free) — proven by racing 8 identical tasks into two waves.
// 03. Event loop, Node vs browser — same microtask queue (V8's), different
//     macrotask machinery (host's). Node 11 quietly fixed the #1 stale
//     answer people still give.
// 04. Phases of the event loop — six queues in a fixed circle. Order is
//     relative to WHERE THE LOOP IS, not to source order — proven by moving
//     the same 3 lines through 3 different starting phases.
// 05. nextTick vs setImmediate — one is a queue that must fully drain
//     before the loop moves; one is a phase resident. That difference is
//     the entire reason one can starve I/O for 500,000 hops and the other
//     can't hold it back past single digits.
// 06. Worker Threads — a REAL thread: its own isolate, heap, loop. Messages
//     are clones, never shares, except SharedArrayBuffer — which is also
//     the one place a Node process can lose an update to a genuine race.
// 07. Child Process — a different PROCESS, not a thread. Same untrusted
//     string ran a second shell command through exec() and did nothing
//     through execFile() — the whole command-injection question in two
//     API calls.
// 08. Cluster module — child_process.fork(), specialized for servers: one
//     port, N processes, ZERO shared memory. A counter split across workers
//     never reached its true total; a killed worker never took the server
//     down.
// 09. Thread pool (libuv), revisited — ONE queue, five unrelated-looking
//     tenants (fs, dns.lookup, zlib, crypto, and — new here — a Worker
//     Thread's own tasks). No priority: a byte of work waited exactly as
//     long as the slow task ahead of it.
// 10. Single-threaded non-blocking I/O — thread count stayed at 7 from 0 to
//     3,000 open sockets. 200 real 100ms waits finished in ~400ms — until
//     ONE blocking line, same architecture, turned it back into serial.
// 11. Blocking vs non-blocking I/O — `async` is not a promise of anything.
//     An async function with no internal await blocked exactly as hard as
//     a plain loop: proven, not asserted, with a ticking timer.
// 12. Streams concept — data as chunks over time, not a value you wait for.
//     Quadrupling a file's size quadrupled fs.readFile's peak memory and
//     barely moved fs.createReadStream's.

const topics = [
  "V8 engine role",
  "libuv role",
  "Event Loop in Node vs Browser",
  "Phases of Node Event Loop",
  "process.nextTick vs setImmediate",
  "Worker Threads",
  "Child Process",
  "Cluster module",
  "Thread pool (libuv)",
  "Single-threaded non-blocking I/O",
  "Blocking vs Non-blocking I/O",
  "Streams concept",
];

console.log("Node.js Internals topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01-02  Node is two libraries wearing one name. V8 runs JavaScript and
//        owns the heap, the stack, the microtask queue — nothing with an
//        operating-system flavor. libuv is Node's operating system: the
//        loop, the timers, the sockets, and a 4-thread pool for whatever
//        the OS has no async syscall for. Every later file lives entirely
//        inside one of these two boxes.
//
//   03-05  ...and the loop libuv runs has a precise, provable shape. 03
//        draws the boundary between what's SPEC-GUARANTEED (microtasks —
//        identical everywhere) and what's HOST-DEFINED (timers, phases —
//        genuinely different between Node and a browser, and quietly
//        changed once already, in Node 11). 04 names the six phases and
//        proves order is positional, not textual. 05 finds the two queues
//        that AREN'T phases — nextTick and microtasks — and shows the one
//        Node invented specifically can starve the other five.
//
//   06-09  Four ways to get more than one thread, and four different
//        prices. A Worker Thread duplicates the isolate, shares nothing but
//        the process and — the twist 09 comes back to prove — the SAME
//        thread pool the main thread uses. A child process duplicates
//        EVERYTHING, paying 2× a worker's startup cost for isolation strong
//        enough that a crash can't corrupt anything shared, because nothing
//        is. Cluster is that same fork() cost, spent once at boot, in
//        exchange for N processes sharing one port and zero shared state.
//        09 returns to the pool from 02 and proves the claim 06 only
//        stated: it is ONE resource, and a Worker Thread's crypto task
//        really does wait behind the main thread's.
//
//   10-12  Zoom back out to the two words everyone quotes — "non-blocking
//        I/O" — and prove both of them separately. 10: the THREAD count
//        doesn't grow with connections (flat at 7, from 0 to 3,000), and
//        the concurrency that buys is real (200 waits, ~1/50th of serial
//        time) — right up until one blocking line collapses it back to
//        serial, on the identical single thread. 11: the syntax that LOOKS
//        non-blocking — async, await, a returned Promise — guarantees
//        nothing; an async function with no real yield point inside it
//        blocks exactly as hard as a plain loop, measured at zero timer
//        ticks either way. 12: the same non-blocking instinct applied to
//        DATA instead of TIME — a stream's memory cost is a function of
//        chunk size, not data size, proven flat across a 4× file-size jump.
//
// THE PUNCHLINE:
//   Every file in this group is really answering one question — WHAT IS
//   THIS THREAD DOING RIGHT NOW, AND WHO DECIDED THAT — and every bug the
//   files list is someone assuming syntax, a library name, or a keyword
//   answered that question when only a measurement actually could. `ref`
//   isn't a prop in 2A.5; here, `async` isn't a promise of non-blocking,
//   Sync isn't the only way to block, and "it returns a Promise" was never
//   evidence of anything by itself.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — WHICH TOOL, AND WHEN
// ══════════════════════════════════════════════════════════════════
//
//   Is the work I/O — waiting on something external?
//     ...a socket, a real timer            → already non-blocking (02, 10).
//        Just don't wrap it in something that blocks anyway (11).
//     ...a file, DNS by hostname, zlib,     → the libuv pool (02, 09). Budget
//        or slow crypto                      it as ONE shared resource.
//
//   Is the work CPU-bound — my own JavaScript, computing something?
//     ...needs to not block THIS request    → chunk it with setImmediate
//                                              (05, 11) — cheap, still 1 core.
//     ...needs real parallel CPU            → Worker Threads (06) — same
//                                              process, shares the pool (09).
//     ...needs a hard crash boundary too,   → child_process (07) — full
//        or isn't even JavaScript             isolation, no shared state.
//     ...IS the whole server, and you want  → cluster (08) — fork() applied
//        every core serving requests          to "share one port".
//
//   Is the DATA the problem, not the operation?
//     ...too big to hold in memory,         → a stream (12). Memory scales
//        or has no fixed end                  with chunk size, not data size.
//
//   Am I not sure whether something blocks?
//     ...check the syntax                   → doesn't tell you (11).
//     ...put a 1ms timer next to it and      → the only test that doesn't
//        count the ticks                       lie (11, and half this group).

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS GROUP PROVES
// ══════════════════════════════════════════════════════════════════
//
//   cold vs warm JIT, same function             ~19× speedup             (01)
//   5 hidden classes at one call site            ~5× slower reads         (01)
//   2,000,000 objects that die immediately       76 MB naive → ~6 MB real (01)
//   8 pool tasks, 4 threads                      2 waves, not 1           (02)
//   pool of 4 vs pool of 8 (same 8 tasks)        2nd wave removed         (02)
//   40× fs.readFileSync, a 1ms timer beside it   0 ticks fired            (02)
//   3 callbacks, 3 phases, one lap               check → close → timers   (04)
//   50ms timer behind a 200ms callback           late by 150+ ms          (04)
//   recursive nextTick vs a finished fs.readFile 500,000 hops, I/O never  (05)
//   ...same race, recursive setImmediate         I/O wins in single digits(05)
//   4 workers × 100,000 unsafe increments        lost thousands, no error (06)
//   ...same race with Atomics.add                exact, every time       (06)
//   an 8 MB ArrayBuffer, transferred              sender's copy → 0 bytes (06)
//   fork() vs a Worker Thread, first message     ~2× slower to start      (07)
//   exec() vs execFile(), identical bad string   ran a 2nd command / didn't (07)
//   fork()'s DEFAULT IPC serialization           a real Buffer → plain obj(07)
//   16 requests, 4 cluster workers, one port     4 distinct PIDs answered (08)
//   a counter split across 2 cluster workers     never once reached 6     (08)
//   4 subsystems queued behind 1 occupied thread all land within ~7ms     (09)
//   main + Worker Thread sharing a pool of 2     worker waits for main    (09)
//   0 to 3,000 open sockets                      thread count: unchanged  (10)
//   200 clients needing a real 100ms wait each   ~50× faster than serial  (10)
//   same server, ONE line swapped to blocking    matches serial exactly   (10)
//   async fn, heavy loop, no internal await      0 timer ticks — same as  (11)
//                                                   a plain blocking loop
//   the SAME work, sliced with setImmediate      real ticks throughout    (11)
//   8 real Node calls, measured not recited      sorted 4-and-4, no misses(11)
//   a file's size ×4 (100 MB → 400 MB)           readFile peak ×~3, ×~1   (12)
//                                                   stream peak: flat
//   time to first usable chunk of a 400 MB file  an order of magnitude    (12)
//                                                   sooner than the full read
//
// None of those are quoted. Every one is produced by code in its file.

// ══════════════════════════════════════════════════════════════════
// THE FIVE TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. TWO BOXES, AND EVERYTHING LIVES IN ONE OF THEM
//    ECMAScript-specified (V8: Promises, microtasks, hidden classes) or
//    host-specified (libuv: timers, phases, the pool). Get a Node fact
//    wrong and it's almost always because it was filed in the wrong box.
//    → 01, 02, 03.
//
// 2. SYNTAX NEVER ANSWERS "DOES THIS BLOCK OR SHARE MEMORY"
//    `async`/`await`/Promise sequence continuations, they don't offload
//    work (11). A callback is a calling convention, not a guarantee (11).
//    postMessage LOOKS like passing a reference; it's a clone (06). The
//    only reliable test in this entire group is a measurement — a ticking
//    timer, a real race, a real crash — never a read of the source.
//
// 3. MORE THREADS IS NEVER FREE, AND THE PRICE IS ALWAYS ISOLATION-SHAPED
//    Worker Thread: cheap, shares the pool (06, 09). Child process: 2×
//    the startup cost, shares nothing (07). Cluster: the same fork() cost,
//    paid once, for a whole server's worth of isolation (08). Every step
//    up this ladder buys more crash isolation and less free sharing — pick
//    the smallest one that gives you what a task actually needs.
//
// 4. ORDER FOLLOWS POSITION, NOT INTENTION
//    The exact same three lines of code run in three different orders
//    depending on which phase the loop happens to be standing in when they
//    execute (04). nextTick beats promises beats setImmediate beats
//    setTimeout — always — except setImmediate vs setTimeout, which is a
//    genuine coin flip outside an I/O callback (03, 05). Nobody wrote a
//    scheduler that reads your mind; there's a queue, and there's wherever
//    the loop is right now.
//
// 5. "NON-BLOCKING" IS ONE IDEA, APPLIED TO TWO DIFFERENT SCARCE THINGS
//    Applied to TIME: don't let a thread sit idle waiting on I/O (02, 10).
//    Applied to SIZE: don't let data sitting in memory grow without bound
//    (12). Same design instinct, same payoff shape — concurrency and
//    responsiveness bought by never holding a scarce resource hostage to
//    one slow or big thing.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What number did the example produce, and how was it measured?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// Section drill — the seven questions this group should let you answer cold:
//   1. What does V8 own, what does libuv own, and why does that split exist?
//   2. Walk the six event-loop phases and say which three are reachable
//      from JavaScript.
//   3. Why does nextTick outrank promises, and why can it starve I/O when
//      setImmediate can't?
//   4. Worker Thread vs child_process vs cluster — for a given task, which
//      one, and what does each one cost you that the others don't?
//   5. What, precisely, does the libuv thread pool contain, and what have
//      you measured competing for it?
//   6. Prove, don't state: does a specific async function actually yield
//      the event loop?
//   7. Why is a stream's memory bounded by chunk size instead of data size?

// ─────────────────────────────────────────────────────────────────
// END OF ◆ NODE.JS INTERNALS (2B.1, group 1 of 2).
//
// Still ahead in this section:
//   ◆ Streams & Buffers — Readable, Writable, Duplex, Transform streams (the
//     deep mechanics 12 deferred), pipe() and pipeline(), Backpressure (in
//     full — 12 only named it), the Buffer class, encoding (utf8/base64/
//     hex), stream chunking, fs streams for large files, zlib compression
//     streams, crypto streams.
//
// NEXT SECTION -> section-2b.1-node-core/02_streams-and-buffers/
// ─────────────────────────────────────────────────────────────────
