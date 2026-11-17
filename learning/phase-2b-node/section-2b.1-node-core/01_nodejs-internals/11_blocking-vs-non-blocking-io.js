// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  11_blocking-vs-non-blocking-io.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Blocking vs Non-blocking I/O
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: BLOCKING IS ABOUT WHETHER
//      THE CALLING THREAD HALTS — nothing to do with sync/async syntax
//   2. The minimal pair: the SAME 50 MB file, read two ways, one freezes a
//      running timer completely and one doesn't
//   3. THE FALLACY, proven live: an `async function` with a heavy loop and no
//      internal `await` blocks EXACTLY as hard as a plain synchronous one —
//      wrapping something in a Promise does not make it non-blocking
//   4. A data-driven roll call — eight real Node APIs, each tested (not
//      recited) against a ticking timer, sorted into two columns by what
//      actually happened
//   5. The real decision framework: what to check, and where it can lie to you
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/11_blocking-vs-non-blocking-io.js"
//
// Prerequisites: 10_single-threaded-non-blocking-io.js (the architecture this
// file's judgment calls serve) and 05_process-nexttick-vs-setimmediate.js §6
// (the setImmediate-chunking technique §4 uses for its non-blocking rewrite).
//
// 10 proved the architecture works AS LONG AS nothing blocks the one thread.
// This file is the missing skill that claim depends on: given one line of
// code, can you actually tell whether it blocks? The syntax gives weaker
// hints than people assume — §4 is the whole reason this file exists.


const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Blocking:
// The calling thread halts — runs nothing else — until the operation
// finishes, full stop, regardless of what syntax wraps it.
//
// Non-blocking:
// The call returns control to the thread immediately; the result (or
// completion) arrives later, via a callback, a promise resolution, or an
// event — and until then, the thread is free to do other work.
//
// If interviewer says "explain it simply", say:
//   "Ask one question: while this operation is in progress, can the event
//    loop do ANYTHING else? If the answer is no — nothing else runs until
//    this returns — it's blocking. That's true whether it's wrapped in a
//    Promise, marked `async`, or plain synchronous code. The wrapper doesn't
//    change the answer."
//
// If interviewer says "so how do you actually tell?", say:
//   "I look for what's happening on the CPU while it 'waits'. If it's a
//    real I/O wait — a socket, a file descriptor, a timer — the thread is
//    genuinely free and something else can run. If it's a loop or a
//    synchronous computation, the thread is busy the whole time no matter
//    what syntax surrounds it. I can prove which one a given line is by
//    putting a 1ms timer next to it and counting how many ticks land."
//
// Why it matters in interviews:
//   The two most tested misconceptions are: (1) "returns a Promise" means
//   non-blocking — false, proven in §4 — and (2) "Node handles it async
//   automatically" — false for anything you compute yourself in plain JS.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ASK "WHAT IS THE CPU DOING WHILE THIS WAITS?", NOT "WHAT SYNTAX IS THIS?"
//
// Runtime rule:
//   A genuinely non-blocking call hands its waiting to the OS (epoll, 02
//   §6) or the pool (09) and returns to the caller immediately. A blocking
//   call does the ENTIRE operation on the calling thread, synchronously,
//   before returning anything — including before resolving any Promise it
//   might be wrapped in, because resolving happens AFTER the wrapped code
//   finishes running.
//
// Practical rule:
//   `async`, `.then()`, `await`, and `new Promise(...)` are all syntax for
//   SEQUENCING, not syntax for OFFLOADING work anywhere. If the function
//   body between `await` points does real work synchronously, that work
//   blocks — Promise or not. Only an operation that ACTUALLY reaches libuv
//   (a real I/O call, a real timer) or another thread (06, 07, 08) is
//   genuinely non-blocking.
//
// Common trap:
//   Reading `async function process() { return heavyComputation(); }` and
//   assuming it's non-blocking because of the `async` keyword. It isn't — an
//   async function with no `await` inside runs synchronously to completion
//   before ANYTHING else gets a turn, exactly like a plain function. §4
//   proves this is not a technicality; it costs exactly as many event-loop
//   ticks as the un-wrapped version.
//
// The mental picture:
//
//   BLOCKING                              NON-BLOCKING
//   (whatever the syntax says)            (whatever the syntax says)
//
//   caller ──▶ [ the WHOLE operation ] ──▶ result       caller ──▶ [ registered with OS/pool ]
//              thread frozen here,                                  │  thread FREE, returns now
//              nothing else can run                                 ▼
//                                                        … other work runs …
//                                                                    │
//                                                                    ▼
//                                                        callback/resolve fires when ready
//
//   The left column can be spelled with `while`, `for`, a *Sync function,
//   OR `async function () { … no await … }`. The right column can ONLY be
//   spelled with something that genuinely reaches libuv or another thread.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE MINIMAL PAIR: SAME FILE, TWO WAYS TO READ IT
// ══════════════════════════════════════════════════════════════════

function withTicking(fn) {
  return new Promise(resolve => {
    let ticks = 0;
    const iv = setInterval(() => ticks++, 1);
    const t0 = Date.now();
    fn(() => {
      clearInterval(iv);
      resolve({ ms: Date.now() - t0, ticks });
    });
  });
}

async function section3() {
  console.log("§3 — the same 50 MB file, read the blocking way and the non-blocking way:\n");

  const tmp = path.join(os.tmpdir(), "blocking-demo-" + process.pid + ".bin");
  fs.writeFileSync(tmp, Buffer.alloc(50 * 1024 * 1024));

  const sync = await withTicking(done => { fs.readFileSync(tmp); done(); });
  console.log("      fs.readFileSync(50MB) :", String(sync.ms).padStart(4), "ms wall  —",
    sync.ticks, "timer ticks fired during it", sync.ticks === 0 ? "🐛 zero — the loop never ran" : "");

  const async_ = await withTicking(done => { fs.readFile(tmp, () => done()); });
  console.log("      fs.readFile(50MB)     :", String(async_.ms).padStart(4), "ms wall  —",
    async_.ticks, "timer ticks fired during it", async_.ticks > 0 ? "✅ the loop kept running" : "");

  fs.unlinkSync(tmp);

  console.log("\n      Both read the SAME bytes. The wall-clock difference is almost");
  console.log("      nothing — reading 50 MB takes about as long either way. The");
  console.log("      difference that matters is what ELSE could happen during that time:");
  console.log("      zero opportunities with Sync, dozens with the async version.\n");

  results.syncTicks = sync.ticks;
  results.asyncTicks = async_.ticks;
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FALLACY: `async` DOES NOT MEAN NON-BLOCKING
// ══════════════════════════════════════════════════════════════════

function heavySync(from, to) {
  let x = 0;
  for (let i = from; i < to; i++) x += Math.sqrt(i);
  return x;
}

// Marked `async`. Returns a Promise. LOOKS exactly like the non-blocking
// APIs all over this codebase. There is no `await` anywhere inside it — so
// the entire body runs SYNCHRONOUSLY before the function returns at all,
// exactly like a plain function would. The `async` keyword only guarantees
// the RETURN VALUE is wrapped in a Promise; it guarantees nothing about
// what happens before that wrapping.
async function heavyAsync(n) {
  return heavySync(0, n);         // 🐛 no await — this is still one big sync call
}

// The genuinely non-blocking rewrite: split the same work into chunks and
// yield the loop a real turn — a real check phase (04) — between each one.
// This is 05 §6's technique, applied here specifically as the FIX for §4's
// bug rather than as a fresh introduction.
function heavyChunked(n, chunkSize) {
  return new Promise(resolve => {
    let i = 0, total = 0;
    (function step() {
      const end = Math.min(i + chunkSize, n);
      total += heavySync(i, end);
      i = end;
      if (i < n) setImmediate(step);   // ← the ONE line that makes this non-blocking
      else resolve(total);
    })();
  });
}

async function section4() {
  console.log("§4 — an `async function`, wrapped in a Promise, with NO internal await:\n");

  const N = 80_000_000;

  const wrapped = await withTicking(async (done) => {
    await heavyAsync(N);
    done();
  });
  console.log("      heavyAsync(n)      (marked `async`, returns a Promise):");
  console.log("        wall time :", wrapped.ms, "ms");
  console.log("        ticks     :", wrapped.ticks, wrapped.ticks === 0 ? "🐛 IDENTICAL to a plain blocking loop — 0" : "");

  const chunked = await withTicking(async (done) => {
    await heavyChunked(N, 2_000_000);
    done();
  });
  console.log("\n      heavyChunked(n)    (SAME total work, sliced + setImmediate):");
  console.log("        wall time :", chunked.ms, "ms  (similar total cost — more loop overhead, less blocking)");
  console.log("        ticks     :", chunked.ticks, chunked.ticks > 0 ? "✅ the loop got real turns throughout" : "");

  console.log("\n      Read those two tick counts again.", wrapped.ticks, "vs", chunked.ticks + ".",
    "The ONLY source code difference is whether the loop was split across");
  console.log("      setImmediate calls. `async`, `await`, and returning a Promise were");
  console.log("      present in BOTH versions and explain NONE of the difference. This is");
  console.log("      the single most common blind spot in 'is this code async?' reviews:");
  console.log("      checking for the keyword instead of checking what actually yields.\n");

  results.wrappedTicks = wrapped.ticks;
  results.chunkedTicks = chunked.ticks;
}


// ══════════════════════════════════════════════════════════════════
// § 5 — A DATA-DRIVEN ROLL CALL: PROVEN, NOT RECITED
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("§5 — eight real Node calls, each measured against a ticking timer:\n");

  const jsonSource = JSON.stringify(
    Array.from({ length: 1_200_000 }, (_, i) => ({ id: i, name: "item" + i }))
  );

  const cases = [
    {
      label: "fs.readFileSync (a real file)",
      expectBlocking: true,
      run: done => {
        const t = path.join(os.tmpdir(), "roll-" + process.pid + ".txt");
        fs.writeFileSync(t, "x".repeat(2_000_000));
        fs.readFileSync(t);
        fs.unlinkSync(t);
        done();
      },
    },
    {
      label: "crypto.pbkdf2Sync",
      expectBlocking: true,
      run: done => { crypto.pbkdf2Sync("x", "y", 400_000, 64, "sha512"); done(); },
    },
    {
      label: "JSON.parse (1.2M records)",
      expectBlocking: true,
      run: done => { JSON.parse(jsonSource); done(); },
    },
    {
      label: "a plain while-loop, 40M iterations",
      expectBlocking: true,
      run: done => { heavySync(0, 40_000_000); done(); },
    },
    {
      label: "fs.readFile (async, same file)",
      expectBlocking: false,
      run: done => {
        const t = path.join(os.tmpdir(), "roll2-" + process.pid + ".txt");
        fs.writeFileSync(t, "x".repeat(2_000_000));
        fs.readFile(t, () => { fs.unlinkSync(t); done(); });
      },
    },
    {
      label: "crypto.pbkdf2 (async form)",
      expectBlocking: false,
      run: done => crypto.pbkdf2("x", "y", 400_000, 64, "sha512", () => done()),
    },
    {
      label: "setTimeout(fn, 40)",
      expectBlocking: false,
      run: done => setTimeout(done, 40),
    },
    {
      label: "heavyChunked (§4's fix, same 40M)",
      expectBlocking: false,
      run: done => heavyChunked(40_000_000, 2_000_000).then(() => done()),
    },
  ];

  const rows = [];
  for (const c of cases) {
    const r = await withTicking(c.run);
    const actualBlocking = r.ticks === 0;
    rows.push({ ...c, ticks: r.ticks, ms: r.ms, actualBlocking });
    console.log("      " + c.label.padEnd(36), String(r.ticks).padStart(3), "ticks  →",
      actualBlocking ? "BLOCKING  " : "non-blocking", actualBlocking === c.expectBlocking ? "" : "🐛 MISMATCH");
  }

  console.log("\n      Every row was MEASURED, not looked up. The rule that sorted them");
  console.log("      correctly every time: zero ticks during the call means the thread");
  console.log("      never came up for air — call it blocking. Any tick at all means it did.\n");

  results.rollCall = rows;
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE DECISION FRAMEWORK
// ══════════════════════════════════════════════════════════════════
//
// A question order that gets the right answer without needing to memorize a
// list of every Node API:
//
//   1. Does it return a VALUE directly (not a Promise, not via callback)?
//        → almost certainly blocking. Nothing genuinely async can hand you
//          a finished result before the call returns.
//
//   2. Does its name end in Sync, or is it a plain computation (a loop, a
//      JSON.parse, a regex, a big string operation)?
//        → blocking, regardless of what calls it or wraps it.
//
//   3. Is it wrapped in `async`/`await`/`new Promise(...)`?
//        → tells you NOTHING by itself. Keep asking: what happens BETWEEN
//          the `await` points? If it's synchronous computation, THAT part
//          blocks, no matter how the function that contains it is declared.
//          → §4, proven.
//
//   4. Does it register with the OS (a real socket, a real timer, a real
//      file-system callback) or hand off to the pool/another thread
//      (09, 06, 07, 08)?
//        → genuinely non-blocking. This is the only category that actually
//          frees the thread while "waiting".
//
// The test that never lies, when reasoning by inspection isn't enough: put a
// 1ms setInterval next to the call and count ticks, exactly like every
// section above did. Zero ticks, blocking. Any ticks, not. This file's
// entire argument is that this test is more reliable than reading the code.


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT "NON-BLOCKING" DOES NOT MEAN
// ══════════════════════════════════════════════════════════════════
//
//   ❌ faster       — §3's two reads took almost the SAME wall-clock time.
//                     Non-blocking buys concurrency for OTHER work, not raw
//                     speed for THIS work.
//   ❌ free          — §4's chunked version had MORE total overhead (more
//                     event-loop laps) than the blocking one, for the exact
//                     same computation. Yielding costs something.
//   ❌ automatic      — nothing makes your own JavaScript non-blocking by
//                     default. You have to reach for a real async API, real
//                     chunking, or another thread. Plain code is blocking by
//                     default; that was file 10's whole point.
//   ❌ guaranteed by
//      "async"/Promise — §4, in full. The keyword sequences continuations;
//                     it does not offload work anywhere.
//
// Non-blocking means exactly one thing: the calling thread was free to do
// other work while this was in progress. That is the entire claim, and it's
// worth exactly as much as file 10 needs it to be worth — no more.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A request handler `async function` that does heavy synchronous
//   work with no internal await, reviewed and approved because it "looks
//   async": it blocks exactly like a plain function. → §4.
//
// Bug 2 — "We already made it a Promise, why is the server still stalling
//   under load?" — wrapping in `new Promise(...)` and doing the work inside
//   the executor synchronously changes nothing. → §4.
//
// Bug 3 — A *Sync call left in "just for now" during development that ships
//   to production inside a hot path: fs.readFileSync, execSync, any Sync
//   crypto function. → §3, §5.
//
// Bug 4 — JSON.parse on a large payload treated as "just parsing, not I/O"
//   and therefore assumed cheap: it's pure CPU, on the main thread, fully
//   blocking, and scales with payload size. → §5.
//
// Bug 5 — Someone "fixes" a blocking loop by wrapping it in
//   `Promise.resolve().then(() => heavyWork())`: this defers the START by
//   one microtask tick and then blocks exactly as hard as before once it
//   starts. Deferred blocking is still blocking.
//
// Bug 6 — Reviewing code by searching for `Sync` in function names and
//   missing a heavy loop, a large regex, or a big string operation with no
//   such suffix at all: the suffix convention only covers the STANDARD
//   LIBRARY's naming, not your own code.
//
// Bug 7 — Load testing a handler in isolation, where nothing else was
//   competing for the thread, and missing that it blocks — the symptom
//   (frozen loop) is invisible until something ELSE needed to run at the
//   same time. → 10 §5's exact mechanism.
//
// Bug 8 — Assuming `await someAsyncLibraryCall()` is always non-blocking
//   because it's a third-party library: the library's implementation might
//   itself be doing sync work before it resolves. Trust the measurement,
//   not the library's naming.
//
// Bug 9 — Chunking CPU work with setImmediate (§4's fix) and being surprised
//   the TOTAL time went up: yielding has real overhead. It buys
//   responsiveness, not speed. → §7.
//
// Bug 10 — Believing a callback-based API can never block: a callback is
//   just a calling convention. Some legacy/native-addon APIs accept a
//   callback and STILL do the work synchronously before invoking it —
//   measure, don't assume from shape alone.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // The minimal pair:
  assert(results.syncTicks === 0,
    "fs.readFileSync let ZERO 1ms timers fire while reading 50 MB — fully blocking 🐛");
  assert(results.asyncTicks > 0,
    "fs.readFile, reading the SAME bytes, let real timer ticks through — genuinely non-blocking ✅");

  // The fallacy:
  assert(results.wrappedTicks === 0,
    "an `async function` with no internal await blocked as completely as a plain loop — 0 ticks 🐛");
  assert(results.chunkedTicks > 0,
    "the IDENTICAL total computation, chunked with setImmediate, let the loop run throughout ✅");

  // The roll call — every measured row must match its documented classification:
  for (const row of results.rollCall) {
    assert(row.actualBlocking === row.expectBlocking,
      `"${row.label}" measured as ${row.actualBlocking ? "BLOCKING" : "non-blocking"}, matching its documented behavior`);
  }
  const blockingCount = results.rollCall.filter(r => r.actualBlocking).length;
  const nonBlockingCount = results.rollCall.filter(r => !r.actualBlocking).length;
  assert(blockingCount === 4 && nonBlockingCount === 4,
    "exactly 4 of 8 real Node calls measured as blocking and 4 as non-blocking — an even, honest split, not a stacked deck");

  console.log("§9 — mini assertions passed for: Blocking vs Non-blocking I/O");
  console.log("\n  The pair that captures it: two functions, BOTH declared `async`, BOTH");
  console.log("  returning a Promise, doing the EXACT SAME 80-million-iteration computation —");
  console.log("  one let 0 timer ticks through, the other let", results.chunkedTicks, "through. The only");
  console.log("  difference was one `setImmediate` call in the middle. Keywords didn't");
  console.log("  decide it; yielding did.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between blocking and non-blocking I/O in
// Node?", answer:
//
//   "Blocking means the calling thread halts and runs nothing else until the
//    operation finishes. Non-blocking means the call returns control
//    immediately and the result arrives later through a callback or a
//    resolved promise, while the thread stays free to do other work in the
//    meantime. I've measured the difference directly: reading the same 50 MB
//    file with fs.readFileSync let zero 1-millisecond timer ticks fire while
//    it ran; fs.readFile, reading the identical bytes, let dozens through.
//
//    The part I'd flag before being asked, because it's the most common
//    mistake I see in reviews: `async`, `await`, and returning a Promise are
//    syntax for SEQUENCING, not for offloading work. An `async function`
//    with no `await` inside it runs its entire body synchronously before
//    returning anything, and it blocks exactly as hard as a plain function
//    would. I've proven that too — an async function doing an 80-million-
//    iteration computation with no internal await let zero timer ticks
//    through, identical to the un-wrapped version. The fix isn't 'make it
//    async', because it already was; the fix is to actually yield — slicing
//    the work and re-queuing the rest with setImmediate between chunks, which
//    measurably lets other work interleave.
//
//    So my actual test for 'does this block' isn't reading the syntax, it's
//    asking what the CPU is doing while it 'waits'. If it's a real I/O wait —
//    a socket, a file descriptor via libuv, a timer — the thread is genuinely
//    free. If it's a loop, a JSON.parse, a big regex, or any synchronous
//    computation, the thread is busy the entire time no matter what's wrapped
//    around it. And when I'm not sure by inspection, I measure it exactly the
//    way I just described — a ticking timer next to the call is a test that
//    doesn't lie, even when the code's own naming does."
//
// Leading with "syntax doesn't decide this" and proving the async-function
// fallacy live is what separates this from a textbook definition.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What's the precise definition of "blocking"?
// A1. The calling thread runs nothing else until the operation completes —
//     a fact about the THREAD, not about the syntax used to call it.
//
// Q2. Does `async function foo() { return heavyWork(); }` block?
// A2. Yes, exactly as much as a plain function — proven: identical zero
//     timer ticks during its execution.
//
// Q3. Does wrapping code in `new Promise((resolve) => { ... })` make it
//     non-blocking?
// A3. No — the executor function runs synchronously, immediately, on the
//     calling thread. Only what you do INSIDE it can be non-blocking.
//
// Q4. How would you empirically verify whether a function blocks?
// A4. Run it beside a fast-ticking timer (or setImmediate chain) and count
//     how many ticks land during the call — zero means blocking.
//
// Q5. Is JSON.parse blocking?
// A5. Yes — pure V8 computation on the calling thread, no I/O involved at
//     all, scales with input size.
//
// Q6. Name four genuinely non-blocking Node primitives.
// A6. Any real async fs/net/dns call reaching libuv, setTimeout/setImmediate
//     (the timers/check phases), a message to a Worker Thread, and any pool
//     task (09) once actually queued.
//
// Q7. Does chunking CPU work with setImmediate make it faster?
// A7. No — usually slightly slower in total, due to per-chunk loop overhead.
//     It buys responsiveness for OTHER work, not speed for this work.
//
// Q8. Can a callback-based API still block?
// A8. Yes — a callback is a calling convention, not a guarantee. Some
//     implementations do the work synchronously and invoke the callback
//     immediately, with the same effect as a Sync function.
//
// Q9. What's the fastest way to sort a 100-line function into blocking or
//     non-blocking without reading every line?
// A9. Check what it awaits/calls at its true leaves — if every leaf is a
//     real async primitive with no unbounded sync computation between
//     await points, it's non-blocking; if any path does sync work between
//     awaits, that path blocks for its duration.
//
// Q10. Does `await` itself ever block the event loop?
// A10. No — `await` suspends the CURRENT async function and returns control
//      to the event loop immediately; it's the WORK being awaited that may
//      or may not block, not the await keyword itself.
//
// Q11. Is Array.prototype.sort on a huge array blocking?
// A11. Yes — pure synchronous V8 computation, same category as JSON.parse
//      and a plain loop.
//
// Q12. If a function returns a Promise that resolves instantly with no
//      apparent delay, is it non-blocking?
// A12. Not necessarily — check if it did real work before resolving.
//      Promise.resolve(heavyWork()) resolves "instantly" only in the sense
//      that resolution happens right after heavyWork() finishes blocking.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Precise definition of blocking?
//   Back : The calling thread runs nothing else until the operation
//          completes — regardless of syntax.
//
// Flashcard 2:
//   Front: Does `async` mean non-blocking?
//   Back : No — proven: an async function with no internal await blocks
//          identically to a plain one.
//
// Flashcard 3:
//   Front: Does wrapping code in `new Promise(...)` help?
//   Back : No — the executor runs synchronously and immediately.
//
// Flashcard 4:
//   Front: The empirical test that never lies?
//   Back : Run it beside a 1ms timer; zero ticks during it means blocking.
//
// Flashcard 5:
//   Front: Is JSON.parse blocking?
//   Back : Yes — pure synchronous V8 computation, no I/O.
//
// Flashcard 6:
//   Front: Does chunking with setImmediate make work faster?
//   Back : No — usually a bit slower overall. It buys responsiveness, not
//          speed.
//
// Flashcard 7:
//   Front: Can a callback-based API still block?
//   Back : Yes — a callback is a convention, not a guarantee.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "I don't read the keyword, I check what the thread is doing while
//          it waits — and I can measure it in one line if I'm not sure."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take any three functions from a real codebase you own. Predict blocking
//   or non-blocking by inspection, then verify each with the withTicking()
//   harness from this file.
//
// Task 2:
//   Rewrite §4's heavyAsync to add a single `await Promise.resolve();` at
//   the top with NO other change. Does that make it non-blocking? Measure it.
//
// Task 3:
//   Add a ninth case to §5's roll call: `Array.prototype.sort` on a
//   3-million-element array. Predict its column before running.
//
// Task 4:
//   Find a third-party npm library's async function, read its source, and
//   determine — by inspection AND by measurement — whether it does any
//   synchronous work before its first genuine yield point.
//
// Task 5:
//   Change heavyChunked's chunkSize from 2,000,000 down to 200,000 and
//   re-measure both wall time and tick count. What trades against what?
//
// Task 6:
//   Build a "blocking linter" toy: a function that wraps any other function,
//   measures ticks during a sample call, and warns if zero ticks were seen.
//
// Task 7:
//   Find one place in code you own where a Promise wraps synchronous work
//   with no real yield point, and fix it using this file's chunking pattern
//   or a real async primitive.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Blocking is a fact about the THREAD, not the SYNTAX. `async`/`await`/
//   Promise sequence continuations; they do not offload work anywhere by
//   themselves.
//
// If you remember the common bug:
//   An `async function` with heavy synchronous work and no internal await,
//   approved in review because it "looked async" and blocked identically to
//   a plain function.
//
// If you remember the professional framing:
//   Don't ask "is this wrapped in a Promise?" Ask "what is the thread doing
//   while this runs?" — and when inspection isn't enough, measure it with a
//   ticking timer, exactly like every proof in this file did.
//
// NEXT TOPIC -> 12_streams-concept.js


(async function main() {
  await section3();
  await section4();
  await section5();
  assertions();
})();
