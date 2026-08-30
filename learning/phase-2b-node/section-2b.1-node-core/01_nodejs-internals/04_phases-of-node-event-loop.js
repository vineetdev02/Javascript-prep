// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  04_phases-of-node-event-loop.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Phases of Node Event Loop
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE LOOP IS A CIRCLE OF SIX
//      PHASES, and each phase has its own FIFO queue
//   2. All six named, and which JavaScript API lands in each
//   3. One lap, instrumented — check before close before the next timers
//   4. A phase drains its whole queue, then the loop moves on: proved with a
//      setImmediate that schedules a setImmediate
//   5. The poll phase is where Node SLEEPS — 300 ms of waiting for 6 ms of CPU
//   6. Why setTimeout is a floor and never a promise
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/04_phases-of-node-event-loop.js"
//
// Prerequisites: 02_libuv-role.js (the loop is libuv's, and handles keep it
// alive) and 03_event-loop-in-node-vs-browser.js §8 — which ended by saying
// "an I/O callback runs in poll, and check is the very next phase". This file
// is the circle that sentence assumed.
//
// File 03 proved that setImmediate beats setTimeout inside an fs callback,
// 50 times out of 50, and asked you to take the reason on trust. Here is the
// reason, drawn and then measured.


const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The phases:
// One iteration of libuv's loop walks through six stages in a fixed order,
// and each stage empties its own queue of callbacks before the loop moves on.
//
// If interviewer says "explain it simply", say:
//   "The event loop is not one queue. It is six queues visited in a fixed
//    circle. setTimeout callbacks go in the first one, I/O completions in the
//    fourth, setImmediate in the fifth, and 'close' events in the sixth. Which
//    queue your callback lands in is what decides the order you see."
//
// If interviewer says "name them", say:
//   "timers, pending callbacks, idle/prepare, poll, check, close callbacks —
//    and only three of those six are reachable from JavaScript."
//
// Why it matters in interviews:
//   Every Node ordering puzzle is answerable mechanically once you know which
//   phase each callback belongs to and where the loop currently is. Without
//   the circle, ordering questions are trivia to be memorised. With it, they
//   are arithmetic.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   SIX QUEUES, ONE CIRCLE, AND A SLEEP IN THE MIDDLE.
//
// Runtime rule:
//   Enter phase → run every callback already in that phase's queue → leave.
//   Callbacks added to a phase's queue WHILE that phase is running wait for
//   the next lap. Between every single callback, the nextTick queue and then
//   the microtask queue are drained to empty.
//
// Practical rule:
//   To predict an order, ask two questions: which phase does this callback
//   belong to, and which phase is the loop in right now? Everything follows.
//
// Common trap:
//   Thinking the loop "checks all six phases for work each time round". It
//   does not shop around — it walks the circle in order, and it SLEEPS in the
//   poll phase. A callback queued for a phase the loop just left waits an
//   entire lap, and if that lap includes a blocking poll, it waits for the
//   poll timeout too.
//
// The mental picture — one iteration of uv_run:
//
//        ┌───────────────────────────────────────────────────────┐
//        │                                                       │
//        ▼                                                       │
//   ┌─────────────┐  setTimeout / setInterval callbacks whose     │
//   │   TIMERS    │  time has come. Not "at" the time — AFTER it. │
//   └─────┬───────┘                                               │
//         ▼                                                       │
//   ┌─────────────┐  a few deferred system callbacks, e.g. some   │
//   │  PENDING    │  TCP errors (ECONNREFUSED) on some platforms  │
//   │  CALLBACKS  │  ← not reachable from JS                      │
//   └─────┬───────┘                                               │
//         ▼                                                       │
//   ┌─────────────┐  libuv's own bookkeeping                      │
//   │ IDLE/PREPARE│  ← not reachable from JS                      │
//   └─────┬───────┘                                               │
//         ▼                                                       │
//   ┌─────────────┐  ★ THE IMPORTANT ONE ★                        │
//   │    POLL     │  1. compute how long we may sleep             │
//   │             │  2. BLOCK in epoll/kqueue/IOCP                │
//   │             │  3. run the I/O callbacks that became ready   │
//   └─────┬───────┘  (fs completions, socket data, connections)   │
//         ▼                                                       │
//   ┌─────────────┐  setImmediate callbacks. "Check" is libuv's   │
//   │    CHECK    │  name; setImmediate is Node's name for it.    │
//   └─────┬───────┘                                               │
//         ▼                                                       │
//   ┌─────────────┐  'close' events: socket.on("close"),          │
//   │   CLOSE     │  server.on("close"). Deliberately last, so a  │
//   │  CALLBACKS  │  destroyed handle's pending work drains first.│
//   └─────┬───────┘                                               │
//         └───────────────────────────────────────────────────────┘
//
//   …and between EVERY callback above:  nextTick queue → microtask queue.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE SIX PHASES, AND WHICH API PUTS YOU IN EACH
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the map from JavaScript you write to phases libuv runs:\n");

const PHASES = [
  ["1. timers",            "setTimeout, setInterval",            "YES"],
  ["2. pending callbacks", "some deferred TCP/UDP errors",       "no"],
  ["3. idle, prepare",     "libuv internal bookkeeping",         "no"],
  ["4. poll",              "fs, net, http, stream I/O callbacks", "YES"],
  ["5. check",             "setImmediate",                        "YES"],
  ["6. close callbacks",   "'close' events on sockets/servers",  "YES"],
];
console.log("      phase".padEnd(28) + "what lands here".padEnd(38) + "reachable from JS?");
console.log("      " + "─".repeat(80));
for (const [name, api, reach] of PHASES) {
  console.log("      " + name.padEnd(22) + api.padEnd(38) + reach);
}

console.log("\n    Four of six are reachable, and people usually only name three of");
console.log("    those — the close-callbacks phase is the one that gets forgotten,");
console.log("    and it is the reason a 'close' handler runs AFTER a setImmediate");
console.log("    you scheduled beside it. §4 measures exactly that.");
console.log("\n    Not on this list, on purpose:");
console.log("      • process.nextTick — not a phase. Its own queue, drained between");
console.log("        every callback. → file 05");
console.log("      • Promise / queueMicrotask — V8's job queue, also drained between");
console.log("        every callback. → 01 §9, 03 §4");
console.log("      • the thread pool — a completion there posts back into POLL, so");
console.log("        fs and pbkdf2 callbacks arrive in the poll phase. → 02 §5\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — ONE LAP, INSTRUMENTED
// ══════════════════════════════════════════════════════════════════

function section4() {
  return new Promise(resolve => {
    console.log("§4 — three callbacks scheduled on the same line, three phases:\n");

    const server = net.createServer(c => c.end());
    server.listen(0, "127.0.0.1", () => {
      const sock = net.connect(server.address().port, "127.0.0.1", () => {
        const order = [];

        sock.on("close", () => order.push("close callbacks (phase 6)"));
        setImmediate(() => order.push("check (phase 5)"));
        setTimeout(() => order.push("timers (phase 1, NEXT lap)"), 0);

        sock.destroy();          // queues the 'close' event

        setTimeout(() => {
          order.forEach((l, i) => console.log("      " + (i + 1) + ". " + l));

          console.log("\n      We are inside a `connect` callback, which ran in POLL.");
          console.log("      From there the loop's remaining itinerary this lap is:");
          console.log("        …poll → CHECK → CLOSE → (lap ends) → TIMERS → …");
          console.log("      So check runs first, close second, and the timer has to");
          console.log("      wait for the loop to come all the way back round. ✅");
          console.log("\n      Change the starting phase and the answer changes with it.");
          console.log("      That is the whole trick: the order is relative to WHERE THE");
          console.log("      LOOP IS, not to the order you wrote the lines in. 🐛\n");

          results.lap = order.slice();
          server.close();
          resolve();
        }, 20);
      });
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — A PHASE DRAINS ITS QUEUE, THEN THE LOOP MOVES ON
// ══════════════════════════════════════════════════════════════════

function section5() {
  return new Promise(resolve => {
    console.log("§5 — what happens to a callback you queue for the phase you are in:\n");

    // A and B are both queued for `check` before the loop gets there, so both
    // run in the SAME check phase. C is queued from INSIDE check, so it is too
    // late for this lap — it runs in the next lap's check phase.
    const chk = [];
    setImmediate(() => { chk.push("A"); setImmediate(() => chk.push("C  ← queued during check")); });
    setImmediate(() => chk.push("B"));

    // Timers behave the same way. Three timers due at the same moment all run
    // in one timers phase; one scheduled from inside a timer callback does not.
    const tim = [];
    setTimeout(() => { tim.push("T1"); setTimeout(() => tim.push("T4  ← queued during timers"), 0); }, 0);
    setTimeout(() => tim.push("T2"), 0);
    setTimeout(() => tim.push("T3"), 0);

    setTimeout(() => {
      console.log("      check phase :", chk.join(", "));
      console.log("        → A and B were both waiting, so both ran in one visit.");
      console.log("          C was created while check was running: next lap. ✅");
      console.log("\n      timers phase:", tim.join(", "));
      console.log("        → T1, T2, T3 were all due, so one visit ran all three.");
      console.log("          T4 was created during the phase: next lap. ✅");

      console.log("\n      The rule, stated precisely enough to answer any puzzle:");
      console.log("        libuv snapshots the phase's queue on entry and runs THAT.");
      console.log("        Anything appended while the phase is running is next lap's");
      console.log("        problem. (There is also a per-phase iteration cap so one");
      console.log("        busy queue cannot starve the other five forever.)");
      console.log("\n      Which is exactly why an infinite setImmediate chain does NOT");
      console.log("      hang Node — each link is a separate lap, so timers and I/O");
      console.log("      still get their turn. An infinite process.nextTick chain does");
      console.log("      hang it, because nextTick is not a phase at all. → file 05\n");

      results.chk = chk.slice();
      results.tim = tim.slice();
      resolve();
    }, 40);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE POLL PHASE: WHERE NODE ACTUALLY SLEEPS
// ══════════════════════════════════════════════════════════════════

function section6() {
  return new Promise(resolve => {
    console.log("§6 — poll is the only phase that BLOCKS, and that is the whole design:\n");

    // On entering poll, libuv computes how long it is allowed to sleep:
    //
    //   • check queue non-empty (a pending setImmediate)? → timeout 0. Do not
    //     sleep; there is already work waiting one phase ahead.
    //   • timers pending? → timeout = milliseconds until the nearest one.
    //   • otherwise, and handles are still referenced → block indefinitely.
    //   • no referenced handles at all → the loop exits and so does Node. (02 §4)
    //
    // Then it calls epoll_wait / kqueue / GetQueuedCompletionStatus and the
    // OS puts the thread to sleep. Zero CPU while nothing is happening. That
    // is what "non-blocking I/O" buys you: not speed, but an idle CPU.

    const cpu0 = process.cpuUsage();
    const t0 = Date.now();

    setTimeout(() => {
      const cpu = process.cpuUsage(cpu0);
      const wall = Date.now() - t0;
      const cpuMs = (cpu.user + cpu.system) / 1000;
      const idleShare = (1 - cpuMs / wall) * 100;

      console.log("      one setTimeout(…, 300) and nothing else to do:");
      console.log("        wall clock :", String(wall).padStart(5), "ms");
      console.log("        CPU used   :", cpuMs.toFixed(2).padStart(5), "ms");
      console.log("        idle       :", idleShare.toFixed(1) + "% of the time ✅");
      console.log("\n      The process was ASLEEP inside epoll_wait for ~" + Math.round(wall - cpuMs) + " ms.");
      console.log("      It was not polling, not spinning, not checking a queue in a");
      console.log("      loop. The kernel woke it when the timeout expired.");
      console.log("\n      Compare the alternative every naive runtime starts with:");
      console.log("        while (true) { if (readyQueue.length) run(); }   🐛 100% CPU");
      console.log("\n      And note the consequence for timer accuracy: the sleep is");
      console.log("      capped by the NEAREST timer, so a timer cannot fire early —");
      console.log("      but nothing stops it firing late. That is §8.\n");

      results.wall = wall;
      results.cpuMs = cpuMs;
      resolve();
    }, 300);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — nextTick AND MICROTASKS RUN *BETWEEN* CALLBACKS
// ══════════════════════════════════════════════════════════════════

function section7() {
  return new Promise(resolve => {
    console.log("§7 — the two queues that are not phases, and cut in everywhere:\n");

    // Two setImmediates, registered in order. Whichever phase the loop is
    // standing in when this function runs, `check`'s queue is still FIFO, so
    // "immediate 1" always runs before "immediate 2" — that part is not a
    // race. What we are actually testing is what Node inserts BETWEEN them.
    const order = [];

    setImmediate(() => {
      order.push("immediate 1");
      process.nextTick(() => order.push("  ↳ nextTick from immediate 1"));
      Promise.resolve().then(() => order.push("  ↳ promise  from immediate 1"));
    });

    setImmediate(() => order.push("immediate 2"));

    setTimeout(() => {
      order.forEach(l => console.log("      " + l));

      const i1 = order.indexOf("immediate 1");
      const i2 = order.indexOf("immediate 2");
      const between = order.slice(i1 + 1, i2);
      const drainedBetween = between.length === 2;

      console.log("\n      Look at what sits between 'immediate 1' and 'immediate 2':",
        drainedBetween ? "both queues ✅" : "nothing 🐛");
      console.log("      Both were due in the SAME check phase, and Node still drained");
      console.log("      nextTick and then microtasks before moving to the next queued");
      console.log("      callback in that SAME phase. Since Node 11 that happens after");
      console.log("      every single callback — not once per phase, and not only at");
      console.log("      phase boundaries. → 03 §5 measured the same change from the");
      console.log("      browser's side.");
      console.log("\n      Order within one gap is always: ALL of nextTick, then ALL of");
      console.log("      microtasks — which is why", JSON.stringify(between[0] || ""), "came before",
        JSON.stringify(between[1] || "") + ".\n");

      results.order7 = order.slice();
      results.drainedBetween = drainedBetween;
      results.betweenOrder = between;
      resolve();
    }, 60);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 8 — setTimeout IS A FLOOR, NOT A PROMISE
// ══════════════════════════════════════════════════════════════════

function section8() {
  return new Promise(resolve => {
    console.log("§8 — 'after at least N ms', and what steals the difference:\n");

    // Case 1: an honest, idle timer.
    const a0 = Date.now();
    setTimeout(() => {
      const cleanMs = Date.now() - a0;

      // Case 2: the same 50 ms timer, but the poll phase is busy for 200 ms
      // when it comes due. The loop cannot pre-empt a running callback, so
      // the timer waits for it.
      const b0 = Date.now();
      setTimeout(() => {
        const lateMs = Date.now() - b0;

        console.log("      setTimeout(…, 50) on an idle loop   :", String(cleanMs).padStart(4), "ms  (asked 50)");
        console.log("      setTimeout(…, 50) behind 200 ms of");
        console.log("        synchronous work in a poll callback:", String(lateMs).padStart(4), "ms  (asked 50) 🐛");
        console.log("      overshoot                            :", lateMs - 50, "ms of pure lateness");

        console.log("\n      Nothing is broken. The timers phase runs callbacks whose");
        console.log("      time has PASSED — and it can only look once per lap. If the");
        console.log("      lap takes 200 ms because one callback did, every timer due");
        console.log("      during those 200 ms fires late, together, in a clump.");
        console.log("\n      This is the mechanism behind every 'my healthcheck timed");
        console.log("      out but the box was idle' incident. The box was not idle for");
        console.log("      200 ms; it was inside one of your callbacks. → file 11");
        console.log("\n      Corollaries worth stating:");
        console.log("        • setInterval(fn, 100) with a 150 ms fn does not run every");
        console.log("          100 ms, and it does not queue up either — libuv reschedules");
        console.log("          from the END of the callback.");
        console.log("        • setTimeout(fn, 0) is stored as 1 ms. There is no 0.");
        console.log("        • a timer can never fire EARLY, because the poll sleep is");
        console.log("          capped by the nearest timer's deadline. §6.\n");

        results.cleanMs = cleanMs;
        results.lateMs = lateMs;
        resolve();
      }, 50);

      // Occupy the poll phase for 200 ms, starting immediately.
      const tmp = path.join(os.tmpdir(), "phases-" + process.pid + ".txt");
      fs.writeFileSync(tmp, "x");
      fs.readFile(tmp, () => {                       // ← runs in POLL
        const stop = Date.now() + 200;
        while (Date.now() < stop) { /* 🐛 blocking the entire loop */ }
        fs.unlinkSync(tmp);
      });
    }, 50);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE THREE PHASES YOU CANNOT SEE
// ══════════════════════════════════════════════════════════════════
//
// Interviewers ask you to name six and then ask what two of them do. Have an
// answer that does not bluff.
//
//   PENDING CALLBACKS
//     libuv's own name is "pending". It runs callbacks that a previous
//     iteration deferred — most visibly certain TCP errors. On Linux a
//     connect() that fails with ECONNREFUSED is reported here rather than in
//     poll, so the error surfaces one phase later than the attempt. You will
//     never schedule anything into it from JavaScript.
//
//   IDLE, PREPARE
//     uv_idle_t and uv_prepare_t handles. Node uses prepare internally; idle
//     handles are the "run me every iteration and keep the loop awake" hook.
//     No public JS API maps to either. They are on the list because libuv's
//     documentation lists them, and because leaving them out makes your
//     six-phase answer a four-phase answer.
//
//   A fourth thing that is not a phase but people put it there:
//     uv__run_closing_handles is the close-callbacks step — that one IS
//     reachable (§4). And the thread-pool "done" queue is not a phase at all:
//     a finished pool task signals the loop through an async handle, and its
//     JS callback runs in POLL. That is why fs, zlib and pbkdf2 callbacks all
//     behave like I/O callbacks. → 02 §5, file 09.
//
// The honest senior framing: "Six phases, four of which I can reach from JS,
// and in practice the three that matter are timers, poll and check."


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A 'close' handler that runs after cleanup code you expected to be
//   later: close callbacks are the LAST phase. → §4.
//
// Bug 2 — setTimeout(fn, 50) firing at 250 ms and blamed on the OS:
//   Something occupied a phase for 200 ms. → §8.
//
// Bug 3 — setInterval(fn, 1000) that drifts:
//   libuv reschedules from the end of the callback, so slow callbacks push the
//   next tick out. Compute deadlines from a clock, not from the interval.
//
// Bug 4 — An ordering test that passes in isolation and fails in the suite:
//   The suite starts the loop in a different phase. → §4.
//
// Bug 5 — "setImmediate is starving my timers":
//   It is not. Each setImmediate chain link is a separate lap. If timers are
//   starved, look for nextTick or a long synchronous callback. → §5, file 05.
//
// Bug 6 — 100% CPU on an idle service:
//   Something is preventing the poll sleep — a 1 ms interval, a busy-wait, or
//   a libuv idle handle from a native addon. §6 is the baseline to compare to.
//
// Bug 7 — An fs callback that seems to run "before" a setImmediate scheduled
//   earlier: it did not; you were in poll and check simply had not come round
//   yet. → §4.
//
// Bug 8 — ECONNREFUSED surfacing one tick later than expected on Linux:
//   The pending-callbacks phase. → §9.
//
// Bug 9 — A graceful shutdown that never completes:
//   server.close() fires its callback in the close phase — but only after
//   every live connection ends. Referenced handles again. → 02 §4.
//
// Bug 10 — Timers "bunching": four timers set 10 ms apart all firing at once
//   after a long callback. One timers phase, four expired deadlines. → §8.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // One lap:
  assert(results.lap.length === 3, "three callbacks, three phases, one lap");
  assert(results.lap[0].includes("check"),
    "from a poll callback, CHECK is the next phase ✅");
  assert(results.lap[1].includes("close"),
    "…then close callbacks, the last phase of the lap");
  assert(results.lap[2].includes("timers"),
    "…and timers only after the loop comes all the way round 🐛");

  // Phase queues are snapshotted:
  assert(results.chk.join(",").startsWith("A,B"),
    "both pending setImmediates ran in the SAME check phase");
  assert(results.chk[2].startsWith("C"),
    "…and one queued DURING check waited for the next lap ✅");
  assert(results.tim.slice(0, 3).join(",") === "T1,T2,T3",
    "three due timers all ran in one timers phase");
  assert(results.tim[3].startsWith("T4"),
    "…and one queued during the phase waited for the next lap ✅");

  // Poll blocks:
  assert(results.wall >= 295, "we really did wait ~300 ms of wall clock");
  assert(results.cpuMs < results.wall / 4,
    "…using under a quarter of that in CPU: the loop SLEEPS in poll ✅");

  // nextTick and microtasks are not phases:
  assert(results.drainedBetween === true,
    "nextTick and microtasks drained BETWEEN two setImmediates in the SAME check phase ✅");
  assert(results.betweenOrder[0].includes("nextTick") && results.betweenOrder[1].includes("promise"),
    "…and in that order: all of nextTick, then all of microtasks");
  assert(results.order7[0] === "immediate 1" && results.order7[3] === "immediate 2",
    "…without disturbing check's own FIFO order between the two immediates");

  // Timers are a floor:
  assert(results.cleanMs >= 50,
    "a timer never fires EARLY — the poll sleep is capped by its deadline");
  assert(results.lateMs > 200,
    "…but a 200 ms callback made a 50 ms timer " + results.lateMs + " ms late 🐛");
  assert(results.lateMs > results.cleanMs * 3,
    "…which is over 3× the honest number, from one blocking callback");

  console.log("§11 — mini assertions passed for: Phases of Node Event Loop");
  console.log("\n  The pair that captures it: three callbacks written on three");
  console.log("  consecutive lines ran in the order", results.lap.map(s => s.split(" ")[0]).join(" → ") + ",");
  console.log("  because that is where the loop was standing — and a 50 ms timer took");
  console.log("  " + results.lateMs + " ms because one callback held a phase for 200 ms, while an idle");
  console.log("  loop spent " + results.wall + " ms waiting on only " + results.cpuMs.toFixed(1) + " ms of CPU.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are the phases of the Node event loop?", answer:
//
//   "Six, in a fixed circle: timers, pending callbacks, idle/prepare, poll,
//    check, and close callbacks. Each has its own FIFO queue, and the loop
//    empties one queue before moving to the next.
//
//    From JavaScript I can only reach four of them. setTimeout and setInterval
//    land in timers. All my I/O callbacks — fs, sockets, http, and anything
//    that finished on the thread pool — land in poll. setImmediate is check.
//    And 'close' events on sockets and servers are the last phase, which is
//    the one people forget.
//
//    Poll is the interesting one. On entering it libuv works out how long it's
//    allowed to sleep: zero if there's already a setImmediate waiting, the
//    time to the nearest timer if there are timers, otherwise indefinitely.
//    Then it blocks in epoll or kqueue. That's why an idle Node process uses
//    no CPU — I measured 300 milliseconds of waiting costing about six
//    milliseconds of CPU. It's also why timers can be late but never early:
//    the sleep is capped by the nearest deadline, but nothing preempts a
//    callback that's already running.
//
//    Two rules make every ordering puzzle mechanical. First, a phase runs the
//    queue it had on entry — anything you add while it's running waits for the
//    next lap, which is why an infinite setImmediate chain doesn't hang Node
//    but an infinite nextTick chain does. Second, nextTick and then microtasks
//    drain between every single callback, not once per phase — that changed in
//    Node 11.
//
//    So the answer to any 'which runs first' question is two questions: which
//    phase does this callback belong to, and where is the loop standing right
//    now. Inside an fs callback I'm in poll, check is next, and timers is a
//    whole lap away — which is why setImmediate beats setTimeout there every
//    time, and why the same two lines at module scope are a coin flip."
//
// Naming all six, admitting only four are reachable, and closing with the
// two-question method is what turns this from recitation into understanding.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Name the six phases in order.
// A1. timers → pending callbacks → idle/prepare → poll → check → close
//     callbacks.
//
// Q2. Which are reachable from JavaScript?
// A2. timers, poll, check, close callbacks. Four of six.
//
// Q3. What does the poll phase do?
// A3. Computes a sleep timeout, blocks in epoll/kqueue/IOCP, then runs the
//     I/O callbacks that became ready.
//
// Q4. How does it decide the timeout?
// A4. 0 if the check queue is non-empty; otherwise the time to the nearest
//     timer; otherwise block indefinitely; and if nothing is referenced at
//     all, the loop exits.
//
// Q5. Why can a timer fire late but never early?
// A5. The sleep is capped by the nearest deadline, so the loop is always awake
//     in time — but a running callback is never preempted, so the timers phase
//     may be reached long after the deadline.
//
// Q6. Where do fs callbacks run, given fs uses the thread pool?
// A6. Poll. A finished pool task signals the loop, which delivers the callback
//     in the poll phase.
//
// Q7. Does an infinite setImmediate loop hang Node?
// A7. No — each link runs in a different lap, so timers and I/O still get
//     turns. An infinite nextTick chain does hang it. → file 05.
//
// Q8. Why is the close phase last?
// A8. So that a destroyed handle's already-queued work drains before you are
//     told it closed.
//
// Q9. What are pending callbacks for?
// A9. Callbacks a previous iteration deferred — most visibly some TCP errors
//     such as ECONNREFUSED on Linux.
//
// Q10. Can one phase starve the others?
// A10. Not indefinitely: libuv caps how many callbacks a phase processes per
//      visit. A single long-running callback absolutely can, though — that is
//      a JavaScript problem, not a loop problem. → file 11.
//
// Q11. Where do process.nextTick and promises fit in the phase list?
// A11. Nowhere. They are not phases; they drain between callbacks.
//
// Q12. Two setIntervals at 100 ms, one with a 150 ms body. What happens?
// A12. The slow one effectively runs every ~150 ms and does not queue up —
//      libuv reschedules from the end of the callback — and it makes the other
//      one late every time it runs.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The six phases in order?
//   Back : timers → pending callbacks → idle/prepare → poll → check → close.
//
// Flashcard 2:
//   Front: Which phase does setImmediate use?
//   Back : check. Which is why it beats setTimeout from inside poll.
//
// Flashcard 3:
//   Front: Where do I/O callbacks run?
//   Back : poll — including thread-pool completions like fs and zlib.
//
// Flashcard 4:
//   Front: What does poll do first?
//   Back : Compute how long it may sleep, then block in epoll/kqueue/IOCP.
//
// Flashcard 5:
//   Front: A callback queued for the phase currently running?
//   Back : Next lap. The phase runs the queue it had on entry.
//
// Flashcard 6:
//   Front: Why is a timer late?
//   Back : A callback held a phase past the deadline. Timers fire after their
//          time, never at it.
//
// Flashcard 7:
//   Front: When do nextTick and microtasks run?
//   Back : Between every callback — all of nextTick, then all of microtasks.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Two questions answer every ordering puzzle: which phase is this
//          callback in, and where is the loop standing right now?"


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Redraw the circle from memory. Then annotate each phase with the JS API
//   that reaches it. Do it until it takes 30 seconds.
//
// Task 2:
//   Move §4's three lines into (a) module scope, (b) a setTimeout, (c) a
//   setImmediate. Predict the order in each case before running.
//
// Task 3:
//   Change §8's blocking loop from 200 ms to 2000 ms. Watch every timer in the
//   file bunch up.
//
// Task 4:
//   Write an infinite setImmediate chain with a setInterval(…, 100) beside it.
//   Confirm the interval still fires. Now do the same with process.nextTick.
//
// Task 5:
//   Instrument setInterval(fn, 100) where fn takes 150 ms. Log actual gaps for
//   20 ticks and plot the drift.
//
// Task 6:
//   Reproduce §6 with an http server up and no traffic. Confirm the CPU number
//   stays near zero for 10 seconds.
//
// Task 7:
//   Attach a 'close' handler and a setImmediate to a socket you destroy, then
//   swap which one you register first. Confirm the order does not change —
//   registration order does not beat phase order.
//
// Task 8:
//   Run the whole file under `strace -c -e trace=epoll_wait node …` (Linux)
//   and look at how few syscalls a sleeping loop makes.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Six queues visited in a circle, and the loop sleeps in the poll phase.
//   Order is relative to where the loop is standing, not to your source order.
//
// If you remember the common bug:
//   A 50 ms timer arriving at 250 ms. The loop was not late; one of your
//   callbacks was long.
//
// If you remember the professional framing:
//   Answer ordering questions mechanically — name the phase, name where the
//   loop is — instead of reciting a list. The list is the input, not the
//   answer.
//
// NEXT TOPIC -> 05_process-nexttick-vs-setimmediate.js


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
