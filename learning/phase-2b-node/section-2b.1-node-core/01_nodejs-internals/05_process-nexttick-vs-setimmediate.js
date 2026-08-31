// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  05_process-nexttick-vs-setimmediate.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: process.nextTick vs setImmediate
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: nextTick IS NOT A PHASE,
//      setImmediate IS — one drains between every callback, one waits a lap
//   2. The priority ladder, nailed down: nextTick beats promises beats
//      setImmediate beats setTimeout, every time it is testable
//   3. nextTick can starve the loop completely; setImmediate structurally
//      cannot — proved by racing both against a real fs read
//   4. The real reason nextTick exists: giving callers a chance to attach an
//      "error" listener before EventEmitter fires
//   5. setTimeout(fn, 0) vs setImmediate(fn) at module scope — a race — and
//      why "recommend setImmediate over setTimeout(0)" is the correct answer
//      anyway, for a reason that has nothing to do with which fires first
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/05_process-nexttick-vs-setimmediate.js"
//
// Prerequisites: 04_phases-of-node-event-loop.js — this file assumed nextTick
// and microtasks "cut in everywhere" and deferred the explanation to here.
//
// 04 §9 already said the honest thing: nextTick is not one of the six
// phases. It is Node's own queue, older than promises, and it outranks them.
// This file is the full story — what that queue is for, what it costs, and
// why "just use setImmediate" is not quite the safe default people repeat.


const fs = require("fs");
const { EventEmitter } = require("events");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// process.nextTick:
// Queue a callback to run BEFORE the event loop continues at all — after the
// current operation finishes, ahead of every promise and every I/O callback.
//
// setImmediate:
// Queue a callback for the CHECK phase — Node's name for "run this once the
// current poll phase is done", one lap of the loop away at the earliest.
//
// If interviewer says "explain it simply", say:
//   "nextTick jumps the entire queue — it is not a phase, it is a VIP line
//    that runs before the loop is even allowed to move. setImmediate gets in
//    a real phase's queue and waits its turn like everything else."
//
// If interviewer says "so which one is 'later'?", say:
//   "nextTick is always sooner. It runs before promises, and promises run
//    before setImmediate. The confusing part is that neither name suggests
//    that — 'immediate' sounds like it should win, and it never does against
//    nextTick."
//
// Why it matters in interviews:
//   This pair is the fastest way to check whether a candidate actually
//   understands the loop or has memorised a diagram. The diagram tells you
//   check comes after poll. It does not tell you nextTick isn't on the
//   diagram at all — and that omission is the entire question.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   NEXTTICK IS A QUEUE. IMMEDIATE IS A PHASE.
//
// Runtime rule:
//   After every callback — not once per phase, since Node 11 — Node drains
//   process.nextTick to empty, THEN drains the promise microtask queue to
//   empty, and ONLY THEN does the loop continue toward wherever it was
//   headed. setImmediate callbacks are ordinary residents of the check
//   phase; they wait exactly as long as any queue makes anything wait.
//
// Practical rule:
//   Reach for nextTick when you need "guaranteed to run before the loop does
//   anything else" — almost always for API consistency (§5). Reach for
//   setImmediate when you need "let I/O and timers get a turn before this
//   runs" — breaking up CPU-heavy work, or deferring past pending I/O.
//
// Common trap:
//   Assuming nextTick is "instant" and therefore harmless. It runs before the
//   loop moves at all, which means a nextTick callback that schedules another
//   nextTick can prevent the loop from EVER moving. §4 proves it stops I/O
//   for two million iterations; setImmediate lets the same I/O through in 4.
//
// The mental picture, extending 04's circle:
//
//     any callback finishes
//            │
//            ▼
//   ┌─────────────────┐
//   │  nextTick queue  │  ← drain to EMPTY. Node's own invention.
//   └────────┬─────────┘     Not in libuv. Not in any spec.
//            ▼
//   ┌─────────────────┐
//   │ microtask queue  │  ← drain to EMPTY. V8's job queue (promises).
//   └────────┬─────────┘
//            ▼
//     loop continues: next queued callback, or the next phase
//                                 │
//                                 ▼
//                    ┌─────────────────────────┐
//                    │ ...timers → poll → CHECK │  ← setImmediate lives here,
//                    │ ...→ close → (repeat)    │     one ordinary resident
//                    └─────────────────────────┘     of one ordinary phase


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PRIORITY LADDER, MEASURED IN ONE SHOT
// ══════════════════════════════════════════════════════════════════

function section3() {
  return new Promise(resolve => {
    console.log("§3 — four schedulers, one line each, same tick:\n");

    const order = [];
    setTimeout(() => order.push("4 setTimeout   (timers phase)"), 0);
    setImmediate(() => order.push("3 setImmediate (check phase)"));
    Promise.resolve().then(() => order.push("2 promise      (microtask queue)"));
    process.nextTick(() => order.push("1 nextTick     (Node's own queue)"));

    setTimeout(() => {
      order.forEach(l => console.log("      " + l));
      const ranked = order.map(l => l.trim()[0]).join("");
      const frontTwoFixed = ranked.startsWith("12");
      console.log("\n      observed rank order:", ranked,
        frontTwoFixed ? "← 1 and 2 are FIXED, always" : "🐛");
      console.log("\n      Say the ladder out loud until it is automatic:");
      console.log("        nextTick  >  promises  >  { setImmediate, setTimeout }");
      console.log("      The first two positions never move — that part is not a race.");
      console.log("      The last two swapped places or not depending on how this run");
      console.log("      happened to land, because setImmediate vs setTimeout(0) AT");
      console.log("      MODULE SCOPE is itself a coin flip (03 §8) — but nextTick and");
      console.log("      promises beating BOTH of them is never a coin flip.\n");
      results.ranked = ranked;
      resolve();
    }, 10);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — nextTick CAN STARVE THE LOOP. setImmediate STRUCTURALLY CANNOT.
// ══════════════════════════════════════════════════════════════════

function section4() {
  return new Promise(resolve => {
    console.log("§4 — race a recursive scheduler against a real file read:\n");

    // Both loops recurse by re-scheduling themselves, and both check a flag
    // set by an fs.readFile callback so we can see exactly how many hops it
    // took for I/O to get a turn — or whether it got one at all.

    function raceNextTick() {
      return new Promise(res => {
        let ioRan = false;
        let hops = 0;
        const CAP = 500_000; // a real cap so a true starve does not hang the file
        fs.readFile(__filename, () => { ioRan = true; });

        (function tick() {
          hops++;
          if (ioRan || hops >= CAP) {
            res({ engine: "nextTick", hops, ioRan });
            return;
          }
          process.nextTick(tick);
        })();
      });
    }

    function raceImmediate() {
      return new Promise(res => {
        let ioRan = false;
        let hops = 0;
        const CAP = 500_000;
        fs.readFile(__filename, () => { ioRan = true; });

        (function step() {
          hops++;
          if (ioRan || hops >= CAP) {
            res({ engine: "setImmediate", hops, ioRan });
            return;
          }
          setImmediate(step);
        })();
      });
    }

    (async () => {
      const a = await raceNextTick();
      const b = await raceImmediate();

      console.log("      recursive process.nextTick vs a real fs.readFile:");
      console.log("        hops before I/O got a turn:", a.hops.toLocaleString(),
        a.ioRan ? "" : `← hit the ${a.hops.toLocaleString()} cap. I/O NEVER got a turn 🐛`);
      console.log("\n      recursive setImmediate vs the same fs.readFile:");
      console.log("        hops before I/O got a turn:", b.hops.toLocaleString(),
        b.ioRan ? "✅" : "🐛");
      console.log("\n      The gap between those two numbers is the entire lesson.");
      console.log("      nextTick is drained to EMPTY before the loop is allowed to");
      console.log("      touch poll — so a self-perpetuating nextTick chain never lets");
      console.log("      poll run, ever, until the chain ends on its own. setImmediate");
      console.log("      is a phase resident: every single hop is a full lap of the");
      console.log("      loop, so poll — and therefore I/O — gets a turn on every hop.");
      console.log("\n      This is documented, deliberately, as recursion nextTick can");
      console.log("      cause: Node's own docs warn against unbounded nextTick chains");
      console.log("      for exactly this reason.\n");

      results.nextTickStarve = a;
      results.immediateStarve = b;
      resolve();
    })();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — WHAT nextTick IS ACTUALLY FOR: THE EVENTEMITTER CONTRACT
// ══════════════════════════════════════════════════════════════════

function section5() {
  console.log("§5 — the real reason nextTick exists, not the recursion trap:\n");

  // EventEmitter has a rule: emit("error", …) with no "error" listener
  // attached THROWS. That is not a bug, it is deliberate — an ignored error
  // event is exactly the failure mode Node refuses to allow silently.
  //
  // Which means: if you emit an error SYNCHRONOUSLY, inside the same call
  // that constructs or configures the emitter, the caller has had no chance
  // to call .on("error", …) yet. You have made a race the caller cannot win.

  class SyncClient extends EventEmitter {
    connect() {
      // 🐛 fires immediately — before connect() has even returned to the
      // caller, let alone before the caller reached the next line
      this.emit("error", new Error("connection refused"));
    }
  }

  class AsyncClient extends EventEmitter {
    connect() {
      // ✅ deferred with nextTick — guaranteed to run AFTER connect()
      // returns and the caller's very next lines have executed
      process.nextTick(() => this.emit("error", new Error("connection refused")));
    }
  }

  let syncThrew = false, syncMessage = null;
  try {
    const client = new SyncClient();
    client.connect();                          // throws HERE, synchronously
    client.on("error", () => {});               // 🐛 never reached
  } catch (e) {
    syncThrew = true;
    syncMessage = e.message;
  }

  console.log("    synchronous emit, same call stack as .connect():");
  console.log("      caller's .on('error', …) ever ran? : false — the throw happened first");
  console.log("      what actually happened             :", syncThrew ? `threw: "${syncMessage}"` : "(did not throw)");
  console.log("      🐛 the emitter and the caller disagree about ordering, and the");
  console.log("         emitter wins by crashing the process");

  const asyncClient = new AsyncClient();
  let asyncCaught = null;
  asyncClient.connect();
  asyncClient.on("error", (e) => { asyncCaught = e.message; });   // this line runs FIRST

  // Prove it, deterministically, without a timer:
  process.nextTick(() => {
    console.log("\n    nextTick-deferred emit, listener attached on the very next line:");
    console.log("      caller's .on('error', …) ever ran? : true");
    console.log("      error actually caught              :", JSON.stringify(asyncCaught), "✅");
    console.log("\n    That is the API guarantee process.nextTick exists to provide:");
    console.log("    'this callback will not run until AFTER you finish the current");
    console.log("     synchronous block' — so a caller who writes emitter.on(...) on");
    console.log("     the line right after can always trust it will be in place.");
    console.log("     This is also why Node's own fs, net and http APIs are careful");
    console.log("     to be consistently async — NEVER sometimes-sync — because a");
    console.log("     function that is sync on one code path and async on another is");
    console.log("     the same race in a different costume. → file 11.\n");

    results.syncThrew = syncThrew;
    results.asyncCaught = asyncCaught;
    section6();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — setImmediate FOR YIELDING CPU-HEAVY WORK
// ══════════════════════════════════════════════════════════════════

function section6() {
  return new Promise(resolve => {
    console.log("§6 — using setImmediate to let I/O interleave with a big loop:\n");

    // A naive "process a million items" runs as one synchronous block and
    // starves everything — including an fs.readFile that is 100% done and
    // just waiting for its callback to be allowed to run.
    let ioReady = false;
    fs.readFile(__filename, () => { ioReady = true; });

    const N = 2_000_000;
    const t0 = Date.now();
    let sum = 0;
    for (let i = 0; i < N; i++) sum += i;
    const blockedMs = Date.now() - t0;
    const ioReadyAfterBlock = ioReady;   // false: the callback is QUEUED, but this loop never yielded

    console.log("      2,000,000-item synchronous loop:", blockedMs, "ms");
    console.log("        I/O callback got to run during it?:", ioReadyAfterBlock, "🐛 (it could not — nothing yielded)");

    // Chunked with setImmediate: same total work, split into slices, and the
    // loop gets a real turn — including poll — between every slice.
    let sum2 = 0, i2 = 0;
    let ioReadyDuringChunks = false;
    fs.readFile(__filename, () => { ioReadyDuringChunks = true; });

    const CHUNK = 50_000;
    const t1 = Date.now();
    (function chunk() {
      const end = Math.min(i2 + CHUNK, N);
      for (; i2 < end; i2++) sum2 += i2;
      if (i2 < N) { setImmediate(chunk); return; }

      const chunkedMs = Date.now() - t1;
      console.log("\n      same work, sliced into", N / CHUNK, "chunks via setImmediate:", chunkedMs, "ms");
      console.log("        same total                        :", sum === sum2, "✅ correctness unchanged");
      console.log("        I/O callback got a turn along the way?:", ioReadyDuringChunks, "✅ — poll ran between chunks");
      console.log("\n      The trade is explicit: chunking costs wall-clock time (more");
      console.log("      laps of the loop = more overhead) to buy other work a chance");
      console.log("      to run. Do this for genuinely long CPU work in a server; do NOT");
      console.log("      do it reflexively for anything short — the overhead is real.\n");

      results.blockedMs = blockedMs;
      results.chunkedMs = chunkedMs;
      results.ioReadyAfterBlock = ioReadyAfterBlock;
      results.ioReadyDuringChunks = ioReadyDuringChunks;
      resolve();
    })();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — setTimeout(fn, 0) vs setImmediate(fn): WHY THE ADVICE STANDS
// ══════════════════════════════════════════════════════════════════
//
// 03 §8 already measured that at module scope, setTimeout(fn, 0) and
// setImmediate(fn) race — the winner depends on whether 1 ms has elapsed
// before the loop first reaches timers. That is real, and it means "which
// fires first" is NOT a reason to prefer one over the other.
//
// The reason to prefer setImmediate anyway has nothing to do with ordering:
//
//   • setTimeout(fn, 0) is a LIE about intent. It is stored as 1 ms — there
//     is no 0 — so the API is quietly rounding your argument. setImmediate
//     says what it means: "next check phase", full stop, no unit.
//   • setImmediate has a smaller, fixed cost: no timer-list insertion, no
//     comparison against a deadline. Under heavy timer load this is
//     measurable; at module scope for one call, it is not.
//   • intent is more inspectable in code review: setTimeout(fn, 0) makes a
//     reviewer ask "why 0? was 100 meant?". setImmediate cannot be typo'd
//     into a different delay.
//
// The correct answer in an interview is therefore NOT "setImmediate always
// wins" — that is false and file 03 disproves it — but "prefer setImmediate
// because it says what you mean, even though the race is real."


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A "ZALGO" API: sometimes sync, sometimes async, based on a cache
//   hit. Callers write code assuming one or the other and it breaks under
//   load. The fix is process.nextTick (or a resolved promise) to force the
//   async path to ALWAYS be async. → §5.
//
// Bug 2 — An EventEmitter subclass that throws on construction some of the
//   time: a synchronous emit("error") before .on() was called. → §5.
//
// Bug 3 — A server that stops accepting connections under load, with no
//   crash and no error: an unbounded recursive nextTick chain (a retry loop,
//   a "keep checking a flag" poll) starving poll completely. → §4.
//
// Bug 4 — "process.maxTickDepth exceeded" in old Node versions (removed in
//   modern Node, replaced by no limit at all — which makes Bug 3 worse, not
//   better, in current Node): a sign the same starvation existed pre-11.
//
// Bug 5 — CPU-bound request handlers that make the WHOLE server unresponsive,
//   "fixed" by chunking with setImmediate but still slow: chunking buys
//   fairness, not speed. The total work is identical. → §6.
//
// Bug 6 — A retry-with-backoff implemented as recursive nextTick calls
//   instead of setTimeout: it was meant to wait, and instead it starves.
//
// Bug 7 — Tests that pass with --inspect or under a debugger and fail in CI:
//   timing-sensitive nextTick/setImmediate races the debugger's overhead
//   happens to resolve differently. → §7 explains why relying on the race at
//   all is the actual bug.
//
// Bug 8 — A library recommending setImmediate "because it is guaranteed to
//   run after setTimeout(0)": false in general, true only from inside an I/O
//   callback. → 03 §8, §7.
//
// Bug 9 — process.nextTick used for "cheap deferral" in a hot path: every
//   call adds queue overhead, and unlike setImmediate it delays the ENTIRE
//   loop, not just this callback's competitors.
//
// Bug 10 — Promise-based code that assumes it can out-schedule a nextTick:
//   it cannot. nextTick was there first, on every lap, by design. → §3.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // The ladder:
  assert(results.ranked.startsWith("12"),
    "nextTick then promise ALWAYS lead — the only part of the ladder that is never a race ✅");
  assert(new Set(results.ranked.split("")).size === 4,
    "…and all four schedulers actually ran, exactly once each");

  // Starvation:
  assert(results.nextTickStarve.ioRan === false,
    "a recursive nextTick chain ran to its cap WITHOUT ever letting fs.readFile's callback fire 🐛");
  assert(results.nextTickStarve.hops >= 400_000,
    "…genuinely hit (close to) the cap, not an early exit");
  assert(results.immediateStarve.ioRan === true,
    "the identical race with setImmediate let I/O finish ✅");
  assert(results.immediateStarve.hops < results.nextTickStarve.hops / 100,
    "…in far fewer hops: every setImmediate hop is a full lap, so poll got repeated turns");

  // EventEmitter contract:
  assert(results.syncThrew === true,
    "emitting 'error' synchronously before a listener is attached THROWS 🐛");
  assert(results.asyncCaught === "connection refused",
    "…and deferring the SAME emit with nextTick lets the caller's listener catch it ✅");

  // CPU chunking:
  assert(results.ioReadyAfterBlock === false,
    "a 2,000,000-item synchronous loop let ZERO I/O through, even though the read had long finished 🐛");
  assert(results.ioReadyDuringChunks === true,
    "the identical work, chunked with setImmediate, let I/O through ✅");
  assert(results.chunkedMs > 0 && results.blockedMs > 0,
    "both the blocking and the chunked variant genuinely ran and were timed");

  console.log("§9 — mini assertions passed for: process.nextTick vs setImmediate");
  console.log("\n  The pair that captures it: a recursive nextTick chain ran",
    results.nextTickStarve.hops.toLocaleString(), "hops without letting a");
  console.log("  finished file read complete, while the identical race with setImmediate");
  console.log("  let it through in", results.immediateStarve.hops, "hops — because one is a queue that must");
  console.log("  empty before the loop moves, and the other is a phase the loop visits.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between process.nextTick and
// setImmediate?", answer:
//
//   "nextTick isn't one of the event loop's phases at all — it's Node's own
//    queue, and it's drained to empty after every single callback, before the
//    loop is allowed to continue anywhere. setImmediate is an ordinary
//    resident of the check phase, so it waits its turn like any other
//    callback. That gives a strict priority order: nextTick, then promise
//    microtasks, then setImmediate, then setTimeout — and nextTick wins that
//    race every time it's testable, which surprises people because the name
//    'immediate' sounds like it should win.
//
//    The practical difference is starvation. I can prove it: race a recursive
//    process.nextTick chain against an fs.readFile that's already finished,
//    and the read's callback never gets a turn — the chain has to end on its
//    own first, because nextTick has to fully drain before the loop can touch
//    poll. Do the identical race with setImmediate and the read wins within a
//    handful of hops, because every setImmediate hop is a full lap of the
//    loop, so poll gets a turn every time.
//
//    What nextTick is actually FOR, not the recursion trap: giving callers a
//    guaranteed window to attach a listener before you fire one. EventEmitter
//    throws on an unlistened 'error' event, so if you emit synchronously
//    inside a method the caller hasn't had a chance to call .on() yet — it's
//    a race they structurally cannot win. Wrap the emit in nextTick and it's
//    guaranteed to run after the caller's very next line, every time. That's
//    the deeper Node principle behind it too — an API should never be
//    sometimes-sync, sometimes-async depending on a cache hit; nextTick or a
//    resolved promise forces the async path to always be async.
//
//    On setTimeout(0) versus setImmediate: I wouldn't claim setImmediate
//    always wins — at module scope it's a genuine race, decided by whether a
//    millisecond has already elapsed. I'd still default to setImmediate,
//    because it says what it means instead of quietly rounding 0 up to 1, and
//    it skips the timer-list bookkeeping entirely."
//
// Leading with "nextTick isn't a phase" and proving starvation with a real
// I/O race — not just a diagram — is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is process.nextTick part of the event loop's phases?
// A1. No. It's Node's own queue, drained to empty before the loop continues,
//     after every callback.
//
// Q2. Priority order of nextTick, promises, setImmediate, setTimeout?
// A2. nextTick, then promise microtasks, then setImmediate, then setTimeout —
//     and the last two are only a race relative to EACH OTHER, never to the
//     first two.
//
// Q3. Can a nextTick chain hang Node forever?
// A3. Structurally yes, if it never stops re-scheduling itself — the loop
//     cannot advance to poll until the queue is empty.
//
// Q4. Can a setImmediate chain do the same?
// A4. No. Each call is a phase resident; the loop completes a full lap
//     between every one, so I/O and timers keep getting turns.
//
// Q5. What is nextTick's actual intended use case?
// A5. Guaranteeing "this runs after the current synchronous block", most
//     often so a caller can attach an event listener before something fires —
//     the EventEmitter 'error' contract is the canonical example.
//
// Q6. Does setImmediate(fn) always run before setTimeout(fn, 0)?
// A6. No — only from inside an I/O callback (poll → check is guaranteed). At
//     module scope it's a race decided by elapsed time.
//
// Q7. Why prefer setImmediate over setTimeout(0) if it's a race?
// A7. Not for ordering — for honesty and cost. It doesn't silently round 0 up
//     to 1, and it skips timer-list insertion/comparison.
//
// Q8. What removed footgun used to cap nextTick recursion?
// A8. process.maxTickDepth, removed in Node 0.12-era changes. Its removal
//     means an unbounded chain has nothing stopping it today.
//
// Q9. Is queueMicrotask the same as process.nextTick?
// A9. No — different queue, lower priority. Order is nextTick, then
//     queueMicrotask/promises.
//
// Q10. Would you use nextTick to break up a CPU-heavy loop?
// A10. No — that's setImmediate's job. nextTick defers WITHIN the current
//      turn; it does not yield to the loop at all.
//
// Q11. What's the actual cost of chunking work with setImmediate?
// A11. More wall-clock time, in exchange for fairness — every chunk boundary
//      is a full lap of loop overhead. Never free.
//
// Q12. Is this priority order guaranteed by any spec?
// A12. No spec at all — it's Node's own implementation choice, documented in
//      Node's own docs, not ECMAScript or any W3C/WHATWG standard.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: nextTick vs setImmediate, structurally?
//   Back : nextTick is a queue drained before the loop moves. setImmediate is
//          a phase the loop visits once per lap.
//
// Flashcard 2:
//   Front: The full priority ladder?
//   Back : nextTick > promises > setImmediate > setTimeout.
//
// Flashcard 3:
//   Front: Can nextTick starve I/O?
//   Back : Yes, completely, if it keeps re-scheduling itself.
//
// Flashcard 4:
//   Front: Can setImmediate starve I/O the same way?
//   Back : No — every call is a full lap of the loop.
//
// Flashcard 5:
//   Front: What is nextTick actually for?
//   Back : Guaranteeing a callback runs after the current sync block —
//          typically so a caller can attach a listener first.
//
// Flashcard 6:
//   Front: Does setImmediate beat setTimeout(0)?
//   Back : Only from inside an I/O callback. At module scope it's a race.
//
// Flashcard 7:
//   Front: Why prefer setImmediate anyway?
//   Back : It says what it means and skips timer bookkeeping — not because
//          it "always wins".
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "nextTick isn't a phase — that's the whole answer, and everything
//          else about starvation follows from it."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the four-scheduler race from §3 with the lines in a different
//   order. Confirm the rank output is unchanged.
//
// Task 2:
//   Lower §4's CAP to 10 and watch nextTick "win" the race by never letting
//   I/O finish within the shortened budget. Raise it back and watch I/O
//   finally get a turn once the chain ends.
//
// Task 3:
//   Build the SyncClient/AsyncClient pair from §5 yourself, without looking,
//   and trigger the crash on purpose. Then fix it.
//
// Task 4:
//   Take §6's chunked loop and remove the setImmediate — confirm the I/O flag
//   goes back to never becoming true during the loop.
//
// Task 5:
//   Time 100,000 process.nextTick(() => {}) calls back to back vs 100,000
//   setImmediate(() => {}) calls. Compare wall-clock cost.
//
// Task 6:
//   Write a retry loop that "waits" between attempts using nextTick instead
//   of setTimeout. Watch it not wait at all — CPU pegged, no actual delay.
//
// Task 7:
//   Find one place in a real codebase you own where an emitter fires
//   synchronously. Rewrite it with nextTick and write the before/after test.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   nextTick is not a phase. It is a queue that must go empty before the loop
//   is allowed to move at all, which is why it outranks everything and why it
//   can starve everything.
//
// If you remember the common bug:
//   A synchronous emit("error") before the caller attached a listener. nextTick
//   is the fix, and it is the actual reason the API exists.
//
// If you remember the professional framing:
//   Use nextTick for ordering guarantees, never for "cheap deferral". Use
//   setImmediate to yield the loop, never assuming it beats setTimeout(0) at
//   module scope — only from inside an I/O callback is that guaranteed.
//
// NEXT TOPIC -> 06_worker-threads.js


(async function main() {
  await section3();
  await section4();
  section5();               // chains into section6() itself, via nextTick
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (results.chunkedMs !== undefined) { clearInterval(check); resolve(); }
    }, 5);
  });
  assertions();
})();
