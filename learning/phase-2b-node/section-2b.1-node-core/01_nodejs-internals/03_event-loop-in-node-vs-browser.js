// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  03_event-loop-in-node-vs-browser.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Event Loop in Node vs Browser
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: TWO DIFFERENT
//      SPECIFICATIONS DESCRIBE THESE LOOPS — HTML's, and libuv's C source
//   2. What is genuinely identical: the microtask queue, because it is V8's
//   3. The Node 11 change that made most "gotcha" blog posts wrong
//   4. Node's two extra queues — nextTick and check — that no browser has
//   5. Rendering: the browser's loop has a paint step, Node's does not, and
//      that single fact explains requestAnimationFrame's absence
//   6. Why setTimeout(0) vs setImmediate is a coin flip at top level and
//      never a coin flip inside an I/O callback — measured both ways
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/03_event-loop-in-node-vs-browser.js"
//
// Prerequisites: 01_v8-engine-role.js §3 and §9 (who owns the microtask
// queue), 02_libuv-role.js §4 (handles keep the loop alive), and
// phase-1-javascript/…/04_asynchronous-javascript/05_microtask-queue-priority.js.
//
// File 01 said: the microtask queue is V8's, but the schedule for draining it
// belongs to the host. File 02 said: the loop itself is libuv's. Put those two
// together and you get this file's answer — the parts of the loop specified by
// ECMAScript are identical everywhere, and the parts specified by the host are
// not. Everything below is a consequence of that one line.


const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The difference:
// The browser's event loop is defined by the HTML specification and has to
// share the thread with rendering; Node's is libuv's uv_run, has no rendering
// to do, and adds two queues of its own — process.nextTick and setImmediate.
//
// If interviewer says "explain it simply", say:
//   "Same idea, different implementations. Both run one JavaScript task at a
//    time and drain all microtasks before the next one. The browser then has
//    to decide whether to paint. Node has no screen, so instead of a rendering
//    step it has a set of I/O phases, plus two extra queues nothing in the
//    browser has."
//
// If interviewer says "so is it the same or not?", say:
//   "The ECMAScript half — promises, async/await, queueMicrotask — is byte for
//    byte the same, because it is V8's job queue and the spec pins the order.
//    The host half — timers, I/O, and when microtasks get drained relative to
//    them — is different, and Node itself changed that behaviour in version 11."
//
// Why it matters in interviews:
//   This question is a filter. The junior answer is "Node has phases, the
//   browser has a task queue". The senior answer names WHY: one loop has to
//   yield to a compositor at 60 Hz and the other has to service a poll()
//   syscall. Every observable difference falls out of that.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   SAME MICROTASKS, DIFFERENT MACROTASKS.
//
// Runtime rule:
//   Both loops obey: run one callback to completion → drain the ENTIRE
//   microtask queue (including microtasks queued by microtasks) → move on.
//   What "move on" means is where they diverge:
//     browser → maybe render (rAF → style → layout → paint), then next task
//     Node    → next callback in this phase, or the next phase
//
// Practical rule:
//   Code whose correctness depends only on promise ordering is portable.
//   Code whose correctness depends on setTimeout(0) landing before or after
//   something else is not portable — and in Node it is not even stable
//   between runs. §8 proves that.
//
// Common trap:
//   Repeating the pre-Node-11 answer: "Node runs the whole timers phase and
//   THEN drains microtasks." That was true up to Node 10 and has been false
//   since Node 11.0.0 — microtasks are drained after every individual
//   callback, exactly like the browser. Most "Node vs browser event loop"
//   articles online still show the old output. §5 measures the current one.
//
// The mental picture:
//
//   BROWSER (HTML spec)                    NODE (libuv uv_run)
//   ───────────────────                    ───────────────────
//   ┌─ pick ONE task from ONE task ─┐      ┌─ timers ──────────────┐
//   │  source (timers, DOM events,  │      │ pending callbacks     │
//   │  network, postMessage, …)     │      │ idle / prepare        │
//   ├─ drain microtasks ────────────┤      │ poll  ← blocks here   │
//   ├─ maybe RENDER: ───────────────┤      │ check (setImmediate)  │
//   │    rAF callbacks              │      │ close callbacks       │
//   │    style → layout → paint     │      └───────────────────────┘
//   │    (~60 Hz, may be skipped)   │        nextTick + microtasks are
//   └─ back to the top ─────────────┘        drained BETWEEN every one
//                                            of those callbacks
//
//   The browser's loop is throttled by a display. Node's is throttled by
//   poll(). That is the whole design difference.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHICH GLOBALS EXIST, AND WHAT THAT TELLS YOU
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the API surface is the fingerprint of the loop:\n");

const NODE_ONLY = ["setImmediate", "process"];
const BROWSER_ONLY = ["requestAnimationFrame", "requestIdleCallback", "window", "document"];
const BOTH = ["setTimeout", "setInterval", "queueMicrotask", "Promise", "MessageChannel"];

const nodeOnlyHere = NODE_ONLY.filter(n => typeof globalThis[n] !== "undefined");
const browserOnlyHere = BROWSER_ONLY.filter(n => typeof globalThis[n] !== "undefined");
const bothHere = BOTH.filter(n => typeof globalThis[n] !== "undefined");

console.log("    Node-only, present here          :", nodeOnlyHere.join(", "), "+ process.nextTick");
console.log("    Browser-only, present here       :", browserOnlyHere.length === 0 ? "(none — as expected)" : browserOnlyHere.join(", "));
console.log("    In both, present here            :", bothHere.join(", "));

console.log("\n    Read the middle line again. requestAnimationFrame is missing not");
console.log("    because Node forgot it, but because there is no frame. There is no");
console.log("    compositor, no vsync, no 16.7 ms budget. A loop with nothing to");
console.log("    paint does not need a step that says 'paint now'.");
console.log("\n    And setImmediate is missing from the browser for the mirror reason:");
console.log("    it names a phase (`check`) that only exists in libuv. Microsoft");
console.log("    shipped it in IE10; no other browser followed, and the WHATWG");
console.log("    explicitly declined to standardise it.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT IS IDENTICAL: THE MICROTASK QUEUE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the part you can rely on everywhere:\n");

// This whole block is ECMAScript. Its order is pinned by the spec, so it is
// the same in Node, Chrome, Firefox, Safari, Deno, Bun and a Cloudflare
// Worker. If your answer to an ordering question only uses these rules, it
// is portable.

const identical = [];
identical.push("1 sync");

Promise.resolve().then(() => {
  identical.push("4 microtask A");
  Promise.resolve().then(() => identical.push("7 microtask A.1 (queued BY a microtask, so it joins the BACK of the queue)"));
});
queueMicrotask(() => identical.push("5 microtask B"));

(async function () {
  identical.push("2 sync (an async fn runs sync up to its first await)");
  await null;                                   // ← this is where it suspends
  identical.push("6 after await (a microtask — it queued third, so it runs third)");
})();

identical.push("3 sync");

// Everything above is queued. Nothing has drained yet — the stack is not
// empty. That is the rule: microtasks run when the current callback returns,
// never in the middle of it.

setTimeout(() => {
  console.log("    order in this process:");
  identical.forEach(l => console.log("      " + l));
  console.log("\n    Three spec rules that produced it:");
  console.log("      • an async function body runs SYNCHRONOUSLY until its first await");
  console.log("      • await X is sugar for Promise.resolve(X).then(rest-of-function)");
  console.log("      • the queue drains COMPLETELY: a microtask queued BY a microtask");
  console.log("        joins the back of the SAME pass — line 7 was created while");
  console.log("        line 4 was running, and still ran before any timer");
  console.log("\n    Paste this block into a browser console. Identical output.");
  console.log("    That is not a coincidence; it is V8's job queue in both. → 01 §9\n");
  section5();
}, 0);

const identicalSnapshot = () => identical;


// ══════════════════════════════════════════════════════════════════
// § 5 — THE NODE 11 CHANGE: WHEN MICROTASKS DRAIN
// ══════════════════════════════════════════════════════════════════

function section5() {
  console.log("§5 — two timers, each queueing a microtask. The classic question:\n");

  const order = [];
  setTimeout(() => { order.push("timer 1"); Promise.resolve().then(() => order.push("  ↳ micro 1")); }, 0);
  setTimeout(() => { order.push("timer 2"); Promise.resolve().then(() => order.push("  ↳ micro 2")); }, 0);

  setTimeout(() => {
    console.log("      observed:", JSON.stringify(order.map(s => s.trim())));
    order.forEach(l => console.log("        " + l));

    const interleaved = order[1].includes("micro 1");
    console.log("\n      Node ≤ 10 printed  : timer 1, timer 2, micro 1, micro 2");
    console.log("        (the ENTIRE timers phase ran, then microtasks drained once)");
    console.log("      Node ≥ 11 prints   : timer 1, micro 1, timer 2, micro 2");
    console.log("        (microtasks drain after EVERY callback — like the browser)");
    console.log("      this process       :", interleaved ? "interleaved ✅ — Node ≥ 11 behaviour" : "batched — pre-11 behaviour");
    console.log("      running on Node    :", process.versions.node);

    console.log("\n    Why this matters more than it looks:");
    console.log("      • it is the single most common out-of-date answer in Node");
    console.log("        interviews, because every pre-2019 blog post shows the old");
    console.log("        output and those posts still rank.");
    console.log("      • it aligned Node with the browser deliberately — the changelog");
    console.log("        for 11.0.0 says so. So the honest modern answer to 'do");
    console.log("        microtasks behave the same?' is now YES, and the differences");
    console.log("        are elsewhere.");
    console.log("      • the same change applies to process.nextTick, which also drains");
    console.log("        after every callback rather than once per phase. → file 05\n");

    results.interleaved = interleaved;
    results.order5 = order.slice();
    section6();
  }, 5);
}


// ══════════════════════════════════════════════════════════════════
// § 6 — NODE'S TWO EXTRA QUEUES
// ══════════════════════════════════════════════════════════════════

const results = {};

function section6() {
  console.log("§6 — the queues the browser does not have:\n");

  const order = [];

  // NOTE: this whole section is itself running inside a TIMERS callback (§5
  // handed control over from a setTimeout). So `check` is the very next phase
  // in this same loop iteration, and `timers` is the top of the next one —
  // which makes the last two lines deterministic HERE. At module scope they
  // are not. That is §8.
  setTimeout(() => order.push("5 setTimeout   (timers phase — top of the NEXT iteration)"), 0);
  setImmediate(() => order.push("4 setImmediate (check phase — the very next phase from here)"));
  Promise.resolve().then(() => order.push("3 promise      (V8 microtask queue)"));
  process.nextTick(() => order.push("2 nextTick     (Node's own queue, ahead of microtasks)"));
  order.push("1 synchronous");

  setTimeout(() => {
    order.forEach(l => console.log("      " + l));

    console.log("\n      The priority ladder inside one Node turn:");
    console.log("        synchronous code");
    console.log("          → process.nextTick queue   (drained to EMPTY)   ← Node only");
    console.log("            → microtask queue        (drained to EMPTY)   ← same as browser");
    console.log("              → the next libuv callback / next phase");
    console.log("\n      In a browser there is no first rung. The ladder starts at");
    console.log("      microtasks, and 'the next libuv callback' is 'the next task,");
    console.log("      possibly after a paint'.");
    console.log("\n      nextTick is not a timer and not a microtask. It is a Node");
    console.log("      invention that predates promises, it outranks them, and it can");
    console.log("      starve the loop completely — which is exactly why file 05 exists.\n");

    results.order6 = order.slice();
    section7();
  }, 5);
}


// ══════════════════════════════════════════════════════════════════
// § 7 — RENDERING, AND TIMER CLAMPING
// ══════════════════════════════════════════════════════════════════

function section7() {
  console.log("§7 — the browser's loop is throttled by a display. Node's is not.\n");

  // The HTML spec clamps nested timers: once a chain of setTimeout callbacks
  // is 5 deep, the minimum delay becomes 4 ms. Node has no such rule — its
  // floor is 1 ms (setTimeout(fn, 0) is silently promoted to 1). So the SAME
  // recursive-timer code runs at a very different speed.
  const DEPTH = 20;
  let depth = 0;
  const t0 = Date.now();

  (function nest() {
    if (++depth > DEPTH) {
      const elapsed = Date.now() - t0;
      const perHop = elapsed / DEPTH;

      // HTML spec: nesting level > 5 → clamp to 4 ms. So in a browser the
      // first 5 hops are ~1 ms and the remaining 15 are ≥ 4 ms each.
      const browserFloor = 5 * 1 + (DEPTH - 5) * 4;

      console.log("     ", DEPTH, "nested setTimeout(fn, 0) calls:");
      console.log("        measured here (Node) :", String(elapsed).padStart(4), "ms →", perHop.toFixed(2), "ms per hop");
      console.log("        browser FLOOR (spec) :", String(browserFloor).padStart(4), "ms — HTML clamps nesting > 5 to 4 ms");
      console.log("        Node's own floor     :    1 ms — setTimeout(fn, 0) becomes setTimeout(fn, 1)");
      console.log("        ratio                :", (browserFloor / Math.max(elapsed, 1)).toFixed(1) + "× slower in a browser");
      console.log("        (the browser number is from the HTML spec, not measured — this");
      console.log("         process has no browser in it. Everything else here is measured.)");

      console.log("\n      Two more display-driven browser rules with no Node equivalent:");
      console.log("        • a background tab throttles timers to ~1 per second, and");
      console.log("          Chrome can freeze them entirely after 5 minutes");
      console.log("        • rAF callbacks do not fire at all in a hidden tab");
      console.log("        Node has neither, because Node has no tab. A Node timer at");
      console.log("        1 ms keeps firing at 1 ms forever, which is also how people");
      console.log("        accidentally build a busy loop that pins a core.");

      console.log("\n      And the structural piece: the browser loop has a RENDERING");
      console.log("      step — rAF callbacks, then style, layout, paint, composite —");
      console.log("      that runs at most once per frame between tasks. That step is");
      console.log("      why a long task 'janks' the page. Node has no such step, so a");
      console.log("      long task in Node does not jank anything; it just delays every");
      console.log("      other callback. Same cause, different visible symptom. → file 11\n");

      results.nestedMs = elapsed;
      results.browserFloor = browserFloor;
      section8();
      return;
    }
    setTimeout(nest, 0);
  })();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — setTimeout(0) vs setImmediate: A COIN FLIP, THEN NOT
// ══════════════════════════════════════════════════════════════════

function section8() {
  console.log("§8 — the most-asked ordering question, answered by measurement:\n");

  // ── part 1: at the top of the main module, it is genuinely a race ──
  //
  // Why: setTimeout(fn, 0) is really setTimeout(fn, 1). The loop enters the
  // timers phase and asks "has 1 ms elapsed since I scheduled that?" If the
  // process happened to spend more than 1 ms getting there, the timer fires
  // first. If not, timers finds nothing due, poll finds nothing to do, and
  // check runs setImmediate first. Machine load decides.
  const probe = 'setTimeout(()=>process.stdout.write("T"),0); setImmediate(()=>process.stdout.write("I"));';
  const RUNS = 15;
  let timerFirst = 0, immediateFirst = 0;
  const seq = [];
  for (let i = 0; i < RUNS; i++) {
    const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });
    const first = r.stdout[0];
    seq.push(first);
    if (first === "T") timerFirst++; else immediateFirst++;
  }

  console.log("      15 fresh processes, each running exactly:");
  console.log("        setTimeout(…, 0);  setImmediate(…);");
  console.log("      first to fire, run by run:", seq.join(" "));
  console.log("        setTimeout  won:", String(timerFirst).padStart(2), "times");
  console.log("        setImmediate won:", String(immediateFirst).padStart(2), "times");
  console.log("      → identical source, different answers:", timerFirst, "vs", immediateFirst,
    timerFirst && immediateFirst ? "🐛 the source code does not decide this" : "(one-sided this run — see the control below)");

  // ── part 1b: and here is exactly WHAT decides it ────────────────
  //
  // Same two lines, but the process is made to spend 3 ms of synchronous work
  // AFTER scheduling them. Now the 1 ms timer is always overdue by the time
  // the loop first reaches the timers phase, so the timer always wins. Change
  // nothing but elapsed time, and the "race" becomes a certainty.
  const probeBusy = probe + ' const s=Date.now(); while(Date.now()-s<3){}';
  const forced = [];
  for (let i = 0; i < 6; i++) {
    forced.push(spawnSync(process.execPath, ["-e", probeBusy], { encoding: "utf8" }).stdout[0]);
  }
  console.log("\n      the SAME two lines + 3 ms of sync work before the loop starts:");
  console.log("        first to fire:", forced.join(" "),
    forced.every(c => c === "T") ? "← setTimeout, 6/6 ✅ no race left" : "");
  console.log("      → so the rule is not 'setTimeout wins' or 'setImmediate wins'. It");
  console.log("        is: WAS THE 1 ms TIMER ALREADY DUE when the loop first reached");
  console.log("        the timers phase? Nothing in your source answers that.");

  // ── part 2: inside an I/O callback, it is guaranteed ──
  //
  // Why: an fs callback runs in the POLL phase. `check` comes immediately
  // after poll in every iteration; `timers` is at the top of the NEXT
  // iteration. So setImmediate always wins, on every OS, every time.
  const tmp = path.join(os.tmpdir(), "loop-order-" + process.pid + ".txt");
  fs.writeFileSync(tmp, "ok");

  const TRIALS = 50;
  let immediateWins = 0, done = 0;

  for (let i = 0; i < TRIALS; i++) {
    fs.readFile(tmp, () => {
      let first = null;
      setTimeout(() => { first ??= "timeout"; finish(); }, 0);
      setImmediate(() => { first ??= "immediate"; });
      function finish() {
        if (first === "immediate") immediateWins++;
        if (++done === TRIALS) report();
      }
    });
  }

  function report() {
    fs.unlinkSync(tmp);
    console.log("\n      the SAME two lines, but inside an fs.readFile callback:");
    console.log("        trials              :", TRIALS);
    console.log("        setImmediate first  :", immediateWins, "/", TRIALS,
      immediateWins === TRIALS ? "✅ every single time" : "🐛");
    console.log("        setTimeout first    :", TRIALS - immediateWins);

    console.log("\n      The reason, in one sentence you can say out loud:");
    console.log("        an I/O callback runs in the POLL phase, and CHECK is the very");
    console.log("        next phase in the same loop iteration, while TIMERS is the top");
    console.log("        of the next one. → file 04 draws the circle.");

    console.log("\n      What a browser does with the same question: nothing, because");
    console.log("      setImmediate does not exist. The nearest equivalent is");
    console.log("      MessageChannel — a real task, not a microtask, and the trick");
    console.log("      every 'setImmediate polyfill' actually uses — and typeof");
    console.log("      MessageChannel here is", JSON.stringify(typeof MessageChannel) + ", so that ONE line is portable.\n");

    results.timerFirst = timerFirst;
    results.immediateFirst = immediateFirst;
    results.forced = forced;
    results.immediateWins = immediateWins;
    results.trials = TRIALS;
    section9();
  }
}


// ══════════════════════════════════════════════════════════════════
// § 9 — ONE LOOP PER WHAT?
// ══════════════════════════════════════════════════════════════════

function section9() {
  console.log("§9 — how many event loops are there?\n");

  console.log("      Browser:");
  console.log("        one loop per 'agent'. Same-origin windows, iframes and popups");
  console.log("        that can reach each other synchronously SHARE one loop and one");
  console.log("        thread — which is why an alert() in an iframe freezes the parent.");
  console.log("        A Web Worker and a cross-origin isolated frame each get their");
  console.log("        own loop, and can only talk by message passing.");
  console.log("\n      Node:");
  console.log("        one loop per THREAD. The main thread has one; every Worker");
  console.log("        Thread gets its own V8 isolate AND its own libuv loop. They");
  console.log("        share the process-wide thread pool but nothing else. → file 06");
  console.log("        Separate processes (child_process, cluster) obviously have");
  console.log("        separate loops — separate everything. → files 07, 08");
  console.log("\n      Same shape, and the same consequence: message passing is the only");
  console.log("      way across the boundary, because you cannot share a call stack.");
  console.log("      postMessage in a browser, worker.postMessage in Node — the same");
  console.log("      structured-clone algorithm underneath, by design.\n");

  section10();
}


// ══════════════════════════════════════════════════════════════════
// § 10 — THE COMPARISON TABLE
// ══════════════════════════════════════════════════════════════════
//
//                         BROWSER                    NODE
//   spec                  HTML "event loop           libuv's uv_run
//                         processing model"          (C source, no spec doc)
//   macrotask sources     many named task queues     6 fixed phases
//                         (timers, DOM, network,     (timers, pending, idle/
//                         history, postMessage…)     prepare, poll, check, close)
//   per turn              exactly ONE task           each phase drains its own
//                                                    queue, with limits
//   microtasks            after every task, and      after every callback
//                         when the stack empties     (since Node 11)
//   extra queues          none                       nextTick (before microtasks)
//                                                    + check (setImmediate)
//   rendering             yes: rAF → style →         none
//                         layout → paint, ~60 Hz
//   timer floor           1 ms, clamped to 4 ms      1 ms, never clamped
//                         after 5 nested levels
//   background throttle   ~1 Hz, then frozen         none
//   blocks on             nothing (it yields)        poll() / epoll_wait
//   one loop per          agent (a set of same-      thread
//                         origin browsing contexts)
//   long task symptom     dropped frames, jank       delayed callbacks,
//                                                    timeouts, dead health checks
//
// The last row is the one to say last. Both loops have exactly the same
// disease — one long synchronous task starves everything — and the symptom
// differs only because one of them owns a screen.


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A library that works in the browser and misorders in Node:
//   It relied on setTimeout(0) being the "next thing". In Node, nextTick and
//   setImmediate both cut in front. → §6.
//
// Bug 2 — A test that passes locally and fails in CI, one line out of order:
//   setTimeout(0) vs setImmediate at module scope. It is a race. → §8.
//
// Bug 3 — An answer marked wrong in an interview for being from 2018:
//   "Node batches microtasks per phase." Not since Node 11. → §5.
//
// Bug 4 — A polling loop that pins a CPU in Node and behaved fine in the
//   browser: the browser was clamping and background-throttling it. Node
//   never does. → §7.
//
// Bug 5 — Animation code ported to Node with a requestAnimationFrame shim
//   built on setTimeout(16): no vsync, so it drifts, and it fires in a
//   different phase than any real rAF would. → §3.
//
// Bug 6 — process.nextTick recursion starving the loop, with no browser
//   equivalent to have warned you: an infinite nextTick chain never lets
//   libuv advance. → file 05.
//
// Bug 7 — "Why is my socket callback late?" A long JSON.parse ran in the poll
//   phase. Same disease as browser jank, invisible symptom. → file 11.
//
// Bug 8 — Shared-state assumptions across an iframe boundary that break when
//   the frame becomes cross-origin isolated — it just got its own loop. §9.
//
// Bug 9 — Code that assumes queueMicrotask and process.nextTick are the same
//   thing: they are two different queues with a strict priority between
//   them. → §6, file 05.
//
// Bug 10 — A "wait for the next frame" helper in an SSR bundle: rAF is
//   undefined on the server, so the promise never resolves and the request
//   hangs. → §3.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function section10() {
  const identical = identicalSnapshot();

  // The identical half:
  assert(identical.slice(0, 3).join(" | ") === "1 sync | 2 sync (an async fn runs sync up to its first await) | 3 sync",
    "all synchronous code runs first — an async function body is sync until its first await");
  assert(identical[3].startsWith("4 microtask A") && identical[4].startsWith("5 microtask B"),
    "microtasks drain in FIFO order — .then registered first, queueMicrotask second");
  assert(identical[5].startsWith("6 after await"),
    "…and the `await null` continuation is third, because it queued third");
  assert(identical[6].includes("queued BY a microtask"),
    "a microtask queued BY a microtask joins the back of the SAME pass ✅ — the queue empties completely");
  assert(identical.length === 7, "seven entries, and every browser produces the same seven");

  // The Node 11 change:
  assert(results.interleaved === true,
    "microtasks drain after EVERY callback, not once per phase — Node ≥ 11 matches the browser ✅");
  assert(results.order5.length === 4, "two timers and their two microtasks all ran");

  // Node's extra queues:
  assert(results.order6[0].includes("synchronous"), "sync first, always");
  assert(results.order6[1].includes("nextTick"),
    "nextTick outranks promises — a queue no browser has 🐛");
  assert(results.order6[2].includes("promise"), "…then V8's microtask queue");
  assert(results.order6[3].includes("setImmediate"),
    "…then libuv's phases. We are inside a timers callback, so CHECK is next ✅");
  assert(results.order6[4].includes("setTimeout"),
    "…and the next timers phase is a whole loop iteration away 🐛 → §8 shows when this flips");

  // No rendering, no clamping:
  assert(typeof requestAnimationFrame === "undefined",
    "no rAF in Node, because there is no frame to request 🐛→ by design");
  assert(typeof globalThis.window === "undefined" && typeof globalThis.document === "undefined",
    "and no window/document — the loop has nothing to paint");
  assert(results.nestedMs < results.browserFloor,
    "20 nested timers beat the HTML spec's clamp floor — Node never clamps ✅");
  assert(typeof setImmediate === "function" && typeof process.nextTick === "function",
    "the two Node-only scheduling primitives are both here");

  // The race, and the non-race:
  assert(results.timerFirst + results.immediateFirst === 15,
    "15 independent processes each answered the ordering question at module scope");
  assert(results.forced.length === 6 && results.forced.every(c => c === "T"),
    "add 3 ms of sync work and setTimeout wins 6/6 — elapsed time decides it, not the source 🐛");
  assert(results.immediateWins === results.trials,
    "inside an fs callback setImmediate won " + results.trials + "/" + results.trials + " — poll is followed by check ✅");

  console.log("§12 — mini assertions passed for: Event Loop in Node vs Browser");
  console.log("\n  The pair that captures it: the 7-step microtask sequence in §4 is");
  console.log("  identical in every JS runtime on earth, while the SAME two lines of");
  console.log("  code in §8 chose setTimeout", results.timerFirst, "times and setImmediate",
    results.immediateFirst, "times across 15");
  console.log("  processes, then setTimeout 6/6 when we added 3 ms of work, then");
  console.log("  setImmediate " + results.immediateWins + "/" + results.trials + " when we moved them into an I/O callback.");
  console.log("  Spec-defined ordering is a promise. Host-defined ordering is a weather report.");
}


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does Node's event loop differ from the browser's?", answer:
//
//   "They're the same idea with two different specifications behind them. The
//    browser's is defined in the HTML spec; Node's is libuv's uv_run, which is
//    really just C source. The part that's identical is the microtask queue,
//    because that's V8's job queue and ECMAScript pins the order — promise and
//    async/await ordering is byte-for-byte the same in Node, Chrome, Deno and
//    a Cloudflare Worker.
//
//    Three real differences. First, the browser's loop has a rendering step —
//    requestAnimationFrame, then style, layout and paint, at most once a frame.
//    Node has no screen, so it has no such step, and that's the whole reason
//    rAF doesn't exist there. Instead Node has libuv's phases: timers, pending
//    callbacks, poll, check, close.
//
//    Second, Node has two scheduling queues the browser doesn't: process.nextTick,
//    which runs before microtasks, and setImmediate, which is the check phase.
//    So the priority ladder in Node is sync, then nextTick, then microtasks,
//    then the next libuv callback — the browser's ladder just doesn't have the
//    nextTick rung.
//
//    Third, timer behaviour. The browser clamps nested timers to 4 ms after
//    five levels and throttles background tabs to about 1 Hz; Node's floor is
//    1 ms and it never clamps or throttles. So the same recursive-timer code
//    runs several times faster in Node, and a polling loop that behaved in a
//    tab can pin a core on a server.
//
//    One correction I'd make to the usual answer: people still say Node drains
//    microtasks once per phase while the browser drains after every task.
//    That was true up to Node 10. Node 11 changed it deliberately to match the
//    browser, so microtasks now drain after every individual callback. Most
//    blog posts on this are older than that change.
//
//    And the one I'd offer without being asked: setTimeout(0) versus
//    setImmediate at the top of a module is genuinely non-deterministic —
//    setTimeout(0) is really 1 ms, so whether the timer is due when the loop
//    first reaches the timers phase depends on how busy the machine was. Move
//    the same two lines inside an I/O callback and setImmediate wins every
//    time, because I/O callbacks run in poll and check is the very next phase."
//
// Leading with "same microtasks, different macrotasks" and volunteering the
// Node 11 correction is what makes this sound current rather than memorised.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Which part of the event loop is identical in both?
// A1. The microtask queue — it is V8's job queue and ECMAScript pins its
//     order. Everything host-scheduled differs.
//
// Q2. Why is there no requestAnimationFrame in Node?
// A2. No rendering step, because no display. rAF is defined as "before the
//     next repaint", and there is no repaint.
//
// Q3. What changed in Node 11?
// A3. Microtasks (and nextTick) began draining after every individual
//     callback instead of once per phase, matching browser behaviour.
//
// Q4. Priority order of nextTick, promises, setTimeout, setImmediate?
// A4. Sync → nextTick (to empty) → microtasks (to empty) → libuv's phases,
//     where timers and check are different phases.
//
// Q5. setTimeout(0) or setImmediate first?
// A5. At module scope: a race, decided by whether 1 ms elapsed before the
//     loop reached the timers phase. Inside an I/O callback: setImmediate,
//     always.
//
// Q6. Does the browser have anything like setImmediate?
// A6. Not standard. MessageChannel/postMessage is the usual polyfill because
//     it is a real task, not a microtask. IE10 shipped setImmediate; nobody
//     else did.
//
// Q7. What is the minimum setTimeout delay in each?
// A7. 1 ms in both nominally, but the browser clamps nesting deeper than 5
//     levels to 4 ms and throttles background tabs. Node does neither.
//
// Q8. How many event loops does a browser tab have?
// A8. One per agent — same-origin frames share it. Workers and cross-origin
//     isolated frames get their own.
//
// Q9. How many does a Node process have?
// A9. One per thread. Each Worker Thread has its own isolate and its own
//     loop; they share the libuv thread pool.
//
// Q10. Does a long synchronous task hurt both the same way?
// A10. It causes the same starvation in both. The browser shows it as dropped
//      frames; Node shows it as late callbacks and dead health checks.
//
// Q11. Is the browser event loop single-threaded?
// A11. The JS is. Rendering, compositing, network and workers are on other
//      threads — structurally the same trick as libuv's pool.
//
// Q12. Which is "faster"?
// A12. Wrong axis. Node's loop does not have to leave room for a compositor,
//      so it can be greedier; the browser's has a hard 16.7 ms budget it must
//      respect. They are optimised for different jobs.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is identical between the two loops?
//   Back : The microtask queue. It is V8's, and ECMAScript pins the order.
//
// Flashcard 2:
//   Front: What does the browser loop have that Node's does not?
//   Back : A rendering step — rAF, style, layout, paint — about once a frame.
//
// Flashcard 3:
//   Front: What does Node have that the browser does not?
//   Back : process.nextTick, setImmediate (the check phase), and six named
//          phases.
//
// Flashcard 4:
//   Front: The Node 11 change?
//   Back : Microtasks drain after every callback, not once per phase.
//
// Flashcard 5:
//   Front: setTimeout(0) vs setImmediate at module scope?
//   Back : A race. Inside an I/O callback, setImmediate always wins.
//
// Flashcard 6:
//   Front: Timer clamping?
//   Back : Browser: 4 ms after 5 nested levels, ~1 Hz in a background tab.
//          Node: 1 ms floor, no clamp, no throttle.
//
// Flashcard 7:
//   Front: One loop per…?
//   Back : Browser: per agent. Node: per thread.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Same microtasks, different macrotasks — and Node 11 already
//          removed the difference people usually quote."


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Copy §4's block into a browser console. Confirm the seven lines match.
//   Then copy §6's block in and count the errors.
//
// Task 2:
//   Run §8's part 1 with the machine under load (`yes > /dev/null &` on a few
//   cores). Watch the T/I ratio shift.
//
// Task 3:
//   Move §8's two lines inside a setTimeout instead of an fs callback. Predict
//   the winner before running. Explain the phase reasoning either way.
//
// Task 4:
//   Write the recursive-timer test in a browser page and time 20 hops. Compare
//   with the Node number this file printed.
//
// Task 5:
//   Build a setImmediate polyfill on MessageChannel. Verify it beats
//   setTimeout(0) and loses to Promise.resolve().
//
// Task 6:
//   Write a nextTick chain 1e6 deep and put a setTimeout(…, 0) beside it.
//   Watch the timer never fire. Now do the same with queueMicrotask.
//
// Task 7:
//   Open two same-origin iframes and call a blocking loop in one. Confirm the
//   other freezes. That is §9's shared agent.
//
// Task 8:
//   Write down, for a piece of code you own, every ordering assumption it
//   makes. Mark each one "ECMAScript" or "host". The host ones are your bugs.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Same microtasks, different macrotasks. The ECMAScript half is portable;
//   the host half is not, and one of the two hosts has a screen to feed.
//
// If you remember the common bug:
//   Quoting pre-Node-11 microtask batching. It has been wrong since 2018 and
//   the internet has not noticed.
//
// If you remember the professional framing:
//   Sort every ordering guarantee into "the spec promised this" or "this
//   implementation happens to do this". Ship code that depends only on the
//   first list.
//
// NEXT TOPIC -> 04_phases-of-node-event-loop.js
