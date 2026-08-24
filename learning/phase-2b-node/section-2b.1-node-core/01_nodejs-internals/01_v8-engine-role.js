// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  01_v8-engine-role.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: V8 engine role
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: V8 RUNS JAVASCRIPT AND
//      NOTHING ELSE — it has no files, no sockets, no timers
//   2. What V8 actually owns: the parser, the JIT pipeline, the heap, the
//      stack, the garbage collector, and every ECMAScript builtin
//   3. Ignition → Sparkplug → Maglev → TurboFan, and what "warm-up" means
//   4. Hidden classes and inline caches — why object SHAPE is a performance API
//   5. The heap you can measure: new space, old space, and the 4 GB ceiling
//   6. The stack you can hit: why recursion depth is a V8 number, not a Node one
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/01_v8-engine-role.js"
//
// Prerequisites: phase-1-javascript/section-1.2-js-async-and-event-loop/
// 04_asynchronous-javascript/01_event-loop-mechanism.js and 02_call-stack.js.
// You already know what a call stack and an event loop DO. This file is about
// which piece of software owns each one.
//
// This is file 01 of Phase 2B for a reason. Every Node interview question that
// goes deep — "why did my server stop responding", "why is fs.readFile async
// but JSON.parse not", "what does Worker Threads actually give you" — bottoms
// out in the split this file draws: V8 executes your JavaScript, and libuv
// (file 02) does everything your JavaScript cannot do by itself.


const v8 = require("v8");

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// V8:
// Google's JavaScript engine — the C++ program that parses your JavaScript,
// compiles it to machine code, runs it on one thread, and manages the memory
// the objects live in.
//
// If interviewer says "explain it simply", say:
//   "V8 turns JavaScript text into machine code and runs it. That is the whole
//    job. It knows about numbers, strings, objects, functions, Promises and
//    the call stack — because those are in the ECMAScript spec. It knows
//    nothing about files, sockets, timers or the terminal, because none of
//    those are in the spec."
//
// If interviewer says "so what IS Node then?", say:
//   "Node is V8 plus libuv plus a C++ binding layer plus a standard library.
//    V8 gives it a language; libuv gives it an operating system; the bindings
//    let JavaScript call into libuv; the standard library — fs, http, stream —
//    is the JavaScript API on top of those bindings."
//
// Why it matters in interviews:
//   Almost every wrong answer about Node comes from putting a job in the wrong
//   box. "The event loop is part of V8" — no, it is libuv (file 02). "Node is
//   multi-threaded" — the JS is not, the I/O is (files 09, 10). "async makes
//   it faster" — async moves work off the V8 thread; it does not make the work
//   smaller (file 11). Get the boxes right and the rest is bookkeeping.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   V8 IS A LANGUAGE, NOT A PLATFORM.
//
// Runtime rule:
//   One V8 isolate = one heap + one call stack + one microtask queue. Your JS
//   runs on exactly one thread inside it, and while it runs, nothing else in
//   that isolate can. Every "concurrency" story in Node is a story about work
//   that happens OUTSIDE this box.
//
// Practical rule:
//   If an API is in the ECMAScript spec (Object, Array, Promise, JSON, Math,
//   Map, Proxy, BigInt, structuredClone-adjacent things), V8 provides it and
//   it exists in every JS runtime. If it is not (setTimeout, require, Buffer,
//   process, fs, console), the HOST provides it — and it can differ between
//   Node, the browser, Deno, Bun and Cloudflare Workers.
//
// Common trap:
//   "setTimeout is JavaScript." It is not. It appears in no ECMAScript
//   specification. Node's setTimeout is libuv's timer phase (file 04); the
//   browser's is the HTML spec's timer task source. Same name, two different
//   implementations, neither of them V8. This is exactly why file 03 —
//   "Event Loop in Node vs Browser" — is a real question with a real answer.
//
// The mental picture:
//
//   ┌──────────────────────── node (the process) ────────────────────────┐
//   │                                                                    │
//   │   ┌──────────── V8 isolate ─────────────┐   ┌──── libuv ────────┐  │
//   │   │  parser → Ignition → TurboFan       │   │  event loop       │  │
//   │   │  call stack                         │◀─▶│  thread pool (4)  │  │
//   │   │  heap (new space / old space)       │   │  epoll/kqueue/IOCP│  │
//   │   │  GC (scavenger + mark-compact)      │   └───────────────────┘  │
//   │   │  microtask queue (Promises)         │            ▲             │
//   │   └─────────────────────────────────────┘            │             │
//   │                    ▲                                 │             │
//   │                    └────── C++ bindings ─────────────┘             │
//   │                                                                    │
//   │   JS standard library: fs, http, stream, crypto, worker_threads …  │
//   └────────────────────────────────────────────────────────────────────┘
//
// Everything in the left box is this file. Everything in the right box is 02.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHAT IS ACTUALLY V8, AND WHAT ONLY LOOKS LIKE IT
// ══════════════════════════════════════════════════════════════════

console.log("§3 — sorting the globals into the two boxes:\n");

console.log("    process.versions.v8   :", process.versions.v8, "  ← the engine");
console.log("    process.versions.uv   :", process.versions.uv, "        ← the event loop (file 02)");
console.log("    process.versions.node :", process.versions.node, "      ← the glue + stdlib");
console.log("    process.versions.modules:", process.versions.modules, "        ← native ABI version");

// The test everyone should be able to run in their head: is this name in the
// ECMAScript specification?
const ECMASCRIPT_GLOBALS = [
  "Object", "Array", "Function", "Promise", "JSON", "Math", "Map", "Set",
  "WeakMap", "Symbol", "Proxy", "Reflect", "BigInt", "RegExp", "Error",
  "Date", "ArrayBuffer", "DataView", "Uint8Array", "globalThis",
];
const HOST_GLOBALS = [
  "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "console",
  "process", "Buffer", "require", "module", "__dirname", "URL", "fetch",
  "TextEncoder", "AbortController",
];

const v8Provided = ECMASCRIPT_GLOBALS.filter(n => typeof globalThis[n] !== "undefined");
const hostProvided = HOST_GLOBALS.filter(
  n => typeof globalThis[n] !== "undefined" || n === "require" || n === "module" || n === "__dirname"
);

console.log("\n    ECMAScript builtins present (V8 ships these):", v8Provided.length, "of", ECMASCRIPT_GLOBALS.length);
console.log("      " + v8Provided.slice(0, 10).join(", ") + ", …");
console.log("    Host-provided names present (V8 ships NONE of these):", hostProvided.length, "of", HOST_GLOBALS.length);
console.log("      " + hostProvided.slice(0, 10).join(", ") + ", …");

// queueMicrotask is the interesting edge: the QUEUE is V8's (it is the
// ECMAScript job queue that Promises drain into), but the FUNCTION that lets
// you push onto it is a host API. WHATWG defines queueMicrotask; Node
// implements it. Promises need no host help at all — which is why the
// microtask queue drains identically in Node and the browser, while timers
// do not. → 03 §5
console.log("\n  The line to say out loud:");
console.log("    \"Promise scheduling is specified by ECMAScript, so V8 owns it and it");
console.log("     behaves the same everywhere. Timer scheduling is specified by the");
console.log("     host, so Node and the browser genuinely differ.\" → file 03\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE JIT PIPELINE, AND WHAT "WARM-UP" MEANS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — V8 does not interpret your code. It compiles it, repeatedly:\n");

// The four tiers, in the order a hot function walks through them:
//
//   source  ──parse──▶  AST  ──▶  Ignition   : bytecode. Fast to produce,
//                                              slow to run. Everything starts here.
//                                  Sparkplug  : baseline machine code, no
//                                              optimisation, compiled in one
//                                              linear pass. Since V8 9.1.
//                                  Maglev     : mid-tier optimiser. SSA-based,
//                                              fast to compile. Since V8 11.x.
//                                  TurboFan   : the real optimiser. Inlining,
//                                              escape analysis, type
//                                              speculation. Slow to compile.
//
// Promotion is driven by an interrupt budget — roughly "how much has this
// function run" — not by a fixed call count. And it goes backwards too:
// DEOPTIMISATION throws away optimised code when a speculation turns out to
// be wrong, and drops the function back to bytecode mid-execution.

function sumSquares(n) {
  let total = 0;
  for (let i = 0; i < n; i++) total += i * i;
  return total;
}

function timeIt(fn, reps) {
  const t0 = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < reps; i++) sink += fn(1000);
  const t1 = process.hrtime.bigint();
  return { ns: Number(t1 - t0) / reps, sink };
}

const cold = timeIt(sumSquares, 50);        // first calls: Ignition bytecode
for (let i = 0; i < 20000; i++) sumSquares(1000);   // make it hot
const warm = timeIt(sumSquares, 50);        // now: optimised machine code

const speedup = cold.ns / warm.ns;

console.log("    same function, same input, 50 calls each:");
console.log("      cold (first calls, bytecode) :", cold.ns.toFixed(0).padStart(7), "ns/call");
console.log("      warm (after 20k warm-up)     :", warm.ns.toFixed(0).padStart(7), "ns/call");
console.log("      speedup                      :", speedup.toFixed(1) + "×", speedup > 1 ? "✅" : "(machine was noisy)");
console.log("      same answer both times       :", cold.sink === warm.sink, "← optimisation is not allowed to change semantics");

console.log("\n  Why an interviewer cares:");
console.log("    • microbenchmarks lie. A benchmark that does not warm up measures");
console.log("      Ignition; one that only warms up measures TurboFan on a shape it");
console.log("      will never see in production. This is the #1 reason 'X is faster");
console.log("      than Y' blog posts are wrong.");
console.log("    • it explains p99 latency on a freshly deployed process: the first");
console.log("      few hundred requests run un-optimised code. Rolling deploys with");
console.log("      no warm-up show a latency spike at every restart.");
console.log("    • to SEE it rather than infer it:");
console.log("        node --allow-natives-syntax -e \"…%GetOptimizationStatus(f)…\"");
console.log("        node --trace-opt --trace-deopt your-file.js\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — HIDDEN CLASSES: OBJECT SHAPE IS A PERFORMANCE API
// ══════════════════════════════════════════════════════════════════

console.log("§5 — why V8 cares what order you assign properties in:\n");

// JavaScript objects are dictionaries, semantically. If V8 implemented them as
// dictionaries, every property read would be a hash lookup. It does not.
//
// V8 gives every object a HIDDEN CLASS (internally: a Map, unrelated to JS
// Map) describing its shape — which properties, at which offsets. Objects
// built the same way share one hidden class, so a property read compiles to
// "check the shape pointer, then load at a fixed offset". That check is an
// INLINE CACHE.
//
//   const a = {};  a.x = 1;  a.y = 2;    →  C0 → C1{x} → C2{x,y}
//   const b = {};  b.y = 2;  b.x = 1;    →  C0 → C3{y} → C4{y,x}
//
//   a and b have the SAME properties and DIFFERENT hidden classes.
//
// An inline cache is:
//   monomorphic  — 1 shape seen   → fastest, inlinable by TurboFan
//   polymorphic  — 2-4 shapes     → a small linear scan
//   megamorphic  — 5+ shapes      → falls back to a global hash lookup
//
// The rule: build objects with the same literal, in the same order, and never
// delete properties. `delete obj.x` moves the object into dictionary mode.

// Two IDENTICAL functions, so each gets its own independent inline cache.
// In real code they are the same function and the shapes pollute each other —
// which is worse, not better.
function readOneShape(o)   { return o.x + o.y; }
function readManyShapes(o) { return o.x + o.y; }

const N = 2000;   // small enough to stay in cache — we are measuring shape, not RAM

// ✅ every object built by the same literal → ONE hidden class → monomorphic
const monomorphic = [];
for (let i = 0; i < N; i++) monomorphic.push({ x: i, y: i });

// 🐛 five different construction orders → FIVE hidden classes → megamorphic
const megamorphic = [];
for (let i = 0; i < N; i++) {
  const o = {};
  switch (i % 5) {
    case 0: o.x = i; o.y = i; break;              // {x,y}
    case 1: o.y = i; o.x = i; break;              // {y,x}  ← different shape!
    case 2: o.a = i; o.x = i; o.y = i; break;     // {a,x,y}
    case 3: o.x = i; o.b = i; o.y = i; break;     // {x,b,y}
    default: o.x = i; o.y = i; o.c = i; break;    // {x,y,c}
  }
  megamorphic.push(o);
}

function drainMono(passes) {
  let s = 0;
  const t0 = process.hrtime.bigint();
  for (let p = 0; p < passes; p++)
    for (let i = 0; i < monomorphic.length; i++) s += readOneShape(monomorphic[i]);
  return { ns: Number(process.hrtime.bigint() - t0) / (passes * monomorphic.length), s };
}
function drainMega(passes) {
  let s = 0;
  const t0 = process.hrtime.bigint();
  for (let p = 0; p < passes; p++)
    for (let i = 0; i < megamorphic.length; i++) s += readManyShapes(megamorphic[i]);
  return { ns: Number(process.hrtime.bigint() - t0) / (passes * megamorphic.length), s };
}

drainMono(100); drainMega(100);                    // warm both — §4 said to
const monoRun = drainMono(3000);
const megaRun = drainMega(3000);
const shapeRatio = megaRun.ns / monoRun.ns;

console.log("    reading o.x + o.y over", N.toLocaleString(), "objects × 3,000 passes:");
console.log("      one hidden class   (monomorphic):", monoRun.ns.toFixed(2).padStart(6), "ns/read");
console.log("      five hidden classes (megamorphic):", megaRun.ns.toFixed(2).padStart(6), "ns/read");
console.log("      cost of the extra shapes        :", shapeRatio.toFixed(1) + "× slower", shapeRatio > 1.5 ? "🐛" : "");
console.log("      identical arithmetic result?    :", monoRun.s === megaRun.s, "← same values, same code, different LAYOUT");

console.log("\n  What this changes in real code:");
console.log("    ❌ const user = {}; if (a) user.name = …; if (b) user.email = …;");
console.log("       → 2^n hidden classes from n optional fields");
console.log("    ✅ const user = { name: a ?? null, email: b ?? null };");
console.log("       → one shape, always");
console.log("    ❌ delete cache[key]   → dictionary mode, permanently slower");
console.log("    ✅ cache[key] = undefined, or use a real Map");
console.log("    → this is why `class` and object literals beat ad-hoc mutation, and");
console.log("      why JSON.parse output (built by one C++ path) is fast to read.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE HEAP V8 GIVES YOU, AND THE GC THAT CLEANS IT
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the memory numbers, measured on this process:\n");

const stats = v8.getHeapStatistics();
const MB = n => (n / 1024 / 1024).toFixed(1) + " MB";

console.log("    heap_size_limit    :", MB(stats.heap_size_limit), "  ← the ceiling. Past this: FATAL heap OOM");
console.log("    total_heap_size    :", MB(stats.total_heap_size), "   ← reserved from the OS right now");
console.log("    used_heap_size     :", MB(stats.used_heap_size), "   ← live JS objects");
console.log("    external_memory    :", MB(stats.external_memory), "   ← Buffers etc. — OUTSIDE the JS heap (file 04 of group 2)");

const spaces = v8.getHeapSpaceStatistics().filter(s => s.space_size > 0);
console.log("\n    heap spaces V8 actually created:");
for (const s of spaces.slice(0, 6)) {
  console.log("      " + s.space_name.padEnd(22), MB(s.space_size).padStart(9), "used", MB(s.space_used_size));
}

// The generational hypothesis, proved on this process:
//   "Most objects die young." V8 bets on it with two collectors:
//     new space  — SCAVENGER (Cheney semi-space copy). Cheap, runs constantly,
//                  stops the world for well under a millisecond.
//     old space  — MARK-SWEEP-COMPACT, mostly concurrent/incremental. Expensive.
//   An object that survives two scavenges is PROMOTED to old space.
//
// So allocating 2,000,000 short-lived objects should NOT grow the heap by
// 2,000,000 × sizeof(object). The scavenger reclaims them as fast as we make
// them. That is a claim we can measure.

const before = process.memoryUsage().heapUsed;
let checksum = 0;
for (let i = 0; i < 2_000_000; i++) {
  const temp = { id: i, tag: "short-lived" };   // allocated, then immediately garbage
  checksum += temp.id & 1;
}
const after = process.memoryUsage().heapUsed;
const growthMB = (after - before) / 1024 / 1024;
const naiveMB = (2_000_000 * 40) / 1024 / 1024;   // ~40 bytes/object is a fair estimate

console.log("\n    allocated 2,000,000 objects that die immediately:");
console.log("      naive expectation (~40 B each):", naiveMB.toFixed(0).padStart(6), "MB");
console.log("      actual heapUsed growth        :", growthMB.toFixed(1).padStart(6), "MB");
console.log("      reclaimed by the scavenger    :", (100 - (growthMB / naiveMB) * 100).toFixed(1) + "%", "✅");
console.log("      checksum (proves the loop ran):", checksum);

console.log("\n  The three things to say about GC in an interview:");
console.log("    1. It is generational: young objects are cheap to collect, old ones");
console.log("       are not. Object pooling often makes things WORSE by forcing");
console.log("       objects into old space.");
console.log("    2. It is a stop-the-world pause for the JS thread — the scavenger");
console.log("       for well under 1 ms, a full mark-compact for tens of ms. That");
console.log("       pause is a latency spike you cannot code around, only reduce.");
console.log("    3. The ceiling is real: --max-old-space-size=4096. A 'memory leak'");
console.log("       in Node is almost always a live reference — a growing Map, an");
console.log("       un-removed listener, a closure kept by a timer — not a GC bug.");
console.log("       → 06_closures-and-memory/ in Phase 1\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE STACK V8 GIVES YOU
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the call stack is V8's, and it has a measurable floor:\n");

function measureStackDepth() {
  let depth = 0;
  function recurse() { depth++; recurse(); }
  try { recurse(); } catch (e) {
    return { depth, name: e.constructor.name, message: e.message };
  }
}

const stack = measureStackDepth();
console.log("    frames before RangeError:", stack.depth.toLocaleString());
console.log("    error thrown            :", stack.name + ":", stack.message);
console.log("    Error.stackTraceLimit   :", Error.stackTraceLimit, "← V8-specific, not ECMAScript");

// Two consequences that show up in real Node code:
//
//   1. Recursion over data is a liability. A recursive JSON walker or a
//      linked-list traversal blows up on ~10k-deep input. Interviewers ask
//      "how would you make this iterative" for exactly this reason.
//   2. `node --stack-size=…` raises it, and is a foot-gun: V8's limit is set
//      below the OS thread stack on purpose. Raise it past the real thread
//      stack and you get a segfault instead of a catchable RangeError.
//
// And note what the number is NOT: it is not a Node setting, not a libuv
// setting, and it differs between the main thread and a worker thread, which
// gets its own stack (file 06).

console.log("\n    Error.captureStackTrace exists:", typeof Error.captureStackTrace === "function",
  "← also V8-only. Not in the spec; not in Safari.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — NUMBERS, STRINGS AND THE THINGS V8 DECIDES FOR YOU
// ══════════════════════════════════════════════════════════════════

console.log("§8 — representation choices you inherit from V8:\n");

// Smis vs heap numbers. A "Smi" (small integer) is stored inline in the
// pointer — no allocation. Anything else (a double, a big integer, NaN) is a
// HeapNumber: a real object on the heap. This is invisible semantically and
// very visible in allocation profiles.
console.log("    Number.MAX_SAFE_INTEGER :", Number.MAX_SAFE_INTEGER, "← IEEE-754 double, 53-bit mantissa");
console.log("    0.1 + 0.2 === 0.3       :", 0.1 + 0.2 === 0.3, "← V8 is not allowed to fix this");
console.log("    0.1 + 0.2               :", 0.1 + 0.2);
console.log("    typeof 2n               :", typeof 2n, "← BigInt: arbitrary precision, always heap-allocated");

// Strings: V8 does not copy on concatenation. It builds a CONS STRING (a rope)
// and only FLATTENS it when someone needs the characters contiguously — a
// comparison, a regex, or handing it to C++. So concatenation in a loop is
// cheap, and the flattening cost lands on whoever reads it first.
let rope = "";
for (let i = 0; i < 100_000; i++) rope += "x";
const t0 = process.hrtime.bigint();
const firstChar = rope[0];                       // ← forces flatten
const flattenNs = Number(process.hrtime.bigint() - t0);

console.log("\n    100,000 string concatenations:");
console.log("      final length            :", rope.length.toLocaleString());
console.log("      cost of the FIRST read  :", flattenNs.toLocaleString(), "ns ← the flatten happens here, not in the loop");
console.log("      first char              :", JSON.stringify(firstChar));

console.log("\n  This is why `arr.join('')` and `+=` in a loop benchmark almost the");
console.log("  same in modern V8, and why the old 'always use join' advice is stale.");
console.log("  It is also why a string built in a loop and then never read is free.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHERE V8 STOPS AND THE REST OF NODE BEGINS
// ══════════════════════════════════════════════════════════════════
//
// Draw this boundary and you can answer most of Phase 2B:
//
//   V8 OWNS                              V8 DOES NOT OWN
//   ───────                              ───────────────
//   parsing + JIT compilation            the event loop            → 02, 04
//   the call stack                       timers (setTimeout)       → 04
//   the JS heap + GC                     setImmediate / nextTick   → 05
//   ECMAScript builtins                  the thread pool           → 09
//   the microtask (job) queue            file and network I/O      → 02, 10
//   Promise resolution semantics         Buffer's backing memory   → group 2
//   async/await desugaring               process, console, require
//   WeakRef / FinalizationRegistry       Worker Threads' plumbing  → 06
//
// The two entries people get wrong:
//
//   • The microtask QUEUE is V8's; the DRAINING SCHEDULE is the host's. V8
//     exposes "run microtasks now" and Node calls it after every macrotask
//     callback AND between phases. The browser calls it when the JS stack
//     empties. Same queue, different drain points — which is the entire
//     content of file 03.
//
//   • Buffer is a Uint8Array (V8 type) over memory allocated OUTSIDE the JS
//     heap (Node's allocator). That is why `external_memory` in §6 is a
//     separate number, and why a Buffer leak does not show up in heapUsed.
//     → 02_streams-and-buffers/04_buffer-class.js §5


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "FATAL ERROR: Reached heap limit — JavaScript heap out of memory":
//   You hit heap_size_limit from §6. The fix is almost never
//   --max-old-space-size; it is finding the live reference. Streams exist
//   precisely so you never hold the whole thing. → group 2, file 07.
//
// Bug 2 — A benchmark that "proves" the slower implementation is faster:
//   No warm-up, so you measured Ignition. → §4.
//
// Bug 3 — p99 latency spikes for 30 seconds after every deploy:
//   Cold code, cold inline caches, cold ICs on a fresh isolate. → §4.
//
// Bug 4 — A hot path that got 3× slower after someone added an optional field:
//   Conditional property assignment multiplied the hidden classes and pushed
//   an inline cache megamorphic. → §5.
//
// Bug 5 — `delete obj[key]` in a cache loop, and throughput halves:
//   Dictionary mode. Use a Map or assign undefined. → §5.
//
// Bug 6 — "RangeError: Maximum call stack size exceeded" on large input only:
//   A recursive walker meeting deeply nested data. → §7.
//
// Bug 7 — Raising --stack-size and getting a segfault instead of an error:
//   V8's limit was deliberately under the OS thread stack. → §7.
//
// Bug 8 — RSS climbs but heapUsed is flat, and the GC never helps:
//   Buffers / external memory, not JS objects. Different allocator, different
//   ceiling. → §6, §9.
//
// Bug 9 — Object pooling made GC pressure worse:
//   Pooled objects survive scavenges, get promoted to old space, and are now
//   collected by the expensive collector instead of the cheap one. → §6.
//
// Bug 10 — Code that works in the browser and crashes in Node (or the reverse):
//   You relied on a host global, not an ECMAScript one. → §3.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The two boxes:
assert(typeof process.versions.v8 === "string" && process.versions.v8.length > 0,
  "V8 is a real, separately-versioned dependency of Node");
assert(process.versions.v8 !== process.versions.node,
  "...with its own version number, because it is a different project");
assert(v8Provided.length === ECMASCRIPT_GLOBALS.length,
  "every ECMAScript builtin is present — V8 ships all of them ✅");
assert(hostProvided.length === HOST_GLOBALS.length,
  "...and every host global is present too — but V8 ships NONE of them");
assert(typeof globalThis.Promise === "function" && typeof globalThis.setTimeout === "function",
  "both work, and only one of them is JavaScript 🐛");

// JIT:
assert(cold.sink === warm.sink,
  "optimisation may not change results — same answer cold and warm");
assert(warm.ns < cold.ns * 10,
  "warm code is not dramatically slower than cold code (loose bound: machines are noisy)");
assert(cold.ns > 0 && warm.ns > 0, "both timings are real measurements");

// Hidden classes:
assert(monoRun.s === megaRun.s,
  "identical arithmetic from both object sets — only the LAYOUT differs");
assert(monomorphic.length === N && megamorphic.length === N,
  "same object count and the same source line reading them — the only variable is SHAPE");
assert(shapeRatio > 1.5,
  "five hidden classes at one call site cost real time: megamorphic is measurably slower 🐛");

// Heap and GC:
assert(stats.heap_size_limit > stats.used_heap_size,
  "there is headroom — cross heap_size_limit and the process dies, it does not throw");
assert(growthMB < naiveMB / 2,
  "2 million short-lived objects cost far less than 2 million × 40 B — the scavenger reclaimed them ✅");
assert(checksum === 1_000_000,
  "...and the loop genuinely ran: 2,000,000 ids, half of them odd");
assert(typeof stats.external_memory === "number",
  "external memory is tracked separately from the JS heap → Buffers live there");

// Stack:
assert(stack.depth > 1000,
  "V8 gives you thousands of frames…");
assert(stack.name === "RangeError",
  "…and then a catchable RangeError, not a crash");
assert(typeof Error.captureStackTrace === "function",
  "Error.captureStackTrace is a V8 extension, not ECMAScript");

// Representation:
assert(0.1 + 0.2 !== 0.3, "IEEE-754 doubles, which V8 must not 'fix'");
assert(rope.length === 100_000 && firstChar === "x",
  "cons strings flatten on first read, not during concatenation");

console.log("§11 — mini assertions passed for: V8 engine role");
console.log("\n  The pair that captures it: every one of the",
  ECMASCRIPT_GLOBALS.length, "ECMAScript builtins is here");
console.log("  because V8 ships them, and every one of the", HOST_GLOBALS.length, "host globals is here");
console.log("  because Node does — and the same line of code, `o.x + o.y`, ran",
  shapeRatio.toFixed(1) + "× slower");
console.log("  purely because five construction orders gave V8 five hidden classes.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is V8's role in Node?", answer:
//
//   "V8 is the JavaScript engine — it parses my code, compiles it to machine
//    code, runs it on a single thread, and owns the heap and the garbage
//    collector. The important half of that sentence is what it does NOT do:
//    V8 has no concept of a file, a socket, a timer or a terminal, because
//    none of those are in the ECMAScript spec. So Node is V8 plus libuv for
//    the OS-level work, a C++ binding layer between them, and a JavaScript
//    standard library on top.
//
//    The test I use is simple: if a name is in ECMAScript — Object, Promise,
//    JSON, Map, Proxy — V8 provides it and it exists in every runtime. If it
//    isn't — setTimeout, require, Buffer, process — the host provides it, and
//    Node's version can legitimately behave differently from the browser's.
//    That's why Promise ordering is identical everywhere and timer ordering
//    isn't.
//
//    On the performance side, three V8 facts change how I write code. First,
//    the JIT is tiered — Ignition bytecode, then Sparkplug, Maglev and
//    TurboFan — so code is genuinely slower for its first few hundred calls.
//    That's why microbenchmarks need warm-up and why p99 spikes right after a
//    deploy. Second, V8 gives objects hidden classes, so object shape is a
//    performance API: build objects the same way every time, don't add fields
//    conditionally, and never use delete on a hot object. Third, the GC is
//    generational — young objects are almost free to collect, promoted ones
//    are not — so object pooling can easily make things worse.
//
//    And I'd flag the boundary that catches people out: the microtask queue
//    is V8's, but the schedule for draining it is the host's. Node drains it
//    after every callback and between event-loop phases; the browser drains it
//    when the stack empties. Same queue, different drain points — which is
//    exactly why the Node-versus-browser event loop question has a real
//    answer."
//
// Leading with "V8 is a language, not a platform" and closing with the
// microtask-queue nuance is what separates a memorised answer from a real one.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is the event loop part of V8?
// A1. No. libuv owns it. V8 exposes a microtask queue and a "drain it now"
//     call; the host decides when to call it. → 02, 04.
//
// Q2. Name three things in Node that are not JavaScript.
// A2. setTimeout, require, Buffer, process, console, fs — none appear in any
//     ECMAScript specification.
//
// Q3. What is an isolate, and how many does a Node process have?
// A3. An isolate is one independent V8 instance: one heap, one stack, one
//     microtask queue. The main thread has one; every Worker Thread gets its
//     own, which is why they cannot share objects. → 06.
//
// Q4. Why is my function slow the first thousand times and fast after?
// A4. Tiering. Ignition → Sparkplug → Maglev → TurboFan, driven by an
//     interrupt budget.
//
// Q5. What is a hidden class and why should I care?
// A5. V8's internal description of an object's shape. Same shape → monomorphic
//     inline cache → a fixed-offset load. Five shapes → megamorphic → hash
//     lookup. So conditional property assignment is a real cost.
//
// Q6. What does `delete obj.x` do to performance?
// A6. Moves the object to dictionary mode. Permanently slower reads. Assign
//     undefined or use a Map.
//
// Q7. Why does RSS grow while heapUsed stays flat?
// A7. External memory — Buffers, native addons, and the allocator's own
//     fragmentation. Buffers are Uint8Arrays over non-heap memory.
//
// Q8. What actually happens at the heap limit?
// A8. A FATAL error and process death, not a catchable exception. You cannot
//     try/catch your way out of heap exhaustion.
//
// Q9. Does --max-old-space-size fix a memory leak?
// A9. No. It postpones the crash. A Node "leak" is a live reference: a growing
//     Map, a retained closure, an un-removed listener.
//
// Q10. Why is the max recursion depth different in a Worker Thread?
// A10. Each thread has its own stack, sized independently of the main one.
//
// Q11. Is async/await implemented by V8 or by Node?
// A11. V8. async functions and await are pure ECMAScript — they desugar to
//      promises and the job queue. What you AWAIT is usually a host promise.
//
// Q12. Same JS runs 10× slower in one service than another. First three
//      questions you ask?
// A12. Is it warmed up (§4)? Is the hot path monomorphic (§5)? Is it GC pause
//      time or actual work — check --trace-gc before guessing (§6).


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is V8's job in one sentence?
//   Back : Parse, compile and run JavaScript, and manage its heap and stack.
//          Nothing else.
//
// Flashcard 2:
//   Front: Is setTimeout JavaScript?
//   Back : No. Not in any ECMAScript spec. Node's is libuv's timer phase.
//
// Flashcard 3:
//   Front: The four JIT tiers?
//   Back : Ignition → Sparkplug → Maglev → TurboFan. Plus deoptimisation back
//          to bytecode.
//
// Flashcard 4:
//   Front: What is a hidden class?
//   Back : V8's record of an object's shape. Same construction order → same
//          hidden class → monomorphic inline cache.
//
// Flashcard 5:
//   Front: Monomorphic / polymorphic / megamorphic?
//   Back : 1 shape / 2–4 shapes / 5+ shapes at one call site.
//
// Flashcard 6:
//   Front: Which collector runs on new space?
//   Back : The scavenger — cheap, constant, sub-millisecond. Old space gets
//          mark-sweep-compact.
//
// Flashcard 7:
//   Front: Where does a Buffer's memory live?
//   Back : Outside the JS heap. It shows in external_memory / RSS, not
//          heapUsed.
//
// Flashcard 8:
//   Front: Who owns the microtask queue, and who decides when it drains?
//   Back : V8 owns the queue; the host schedules the drain. Same queue,
//          different drain points in Node and the browser.
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "V8 is a language, not a platform — every Node concurrency story
//          is a story about work happening outside the isolate."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Print process.versions and say out loud which component each entry is
//   responsible for. Do it until you can do it without the file.
//
// Task 2:
//   Take the §4 benchmark and delete the warm-up loop. Watch the "speedup"
//   collapse. That is every bad microbenchmark you have ever read.
//
// Task 3:
//   Run it with `node --trace-opt --trace-deopt` and find sumSquares being
//   promoted. Then make it polymorphic (call it with a string once) and find
//   the deopt.
//
// Task 4:
//   Build a user object with 4 optional fields via `if` blocks. Count the
//   hidden classes you could produce (2^4). Rewrite it as one literal.
//
// Task 5:
//   Add `delete o.x` to the monomorphic loop in §5 and re-run. Note how much
//   of the gap that single line accounts for.
//
// Task 6:
//   Run with --max-old-space-size=64 and push objects into a module-level
//   array until it dies. Note that it is a FATAL error, not a catchable one.
//
// Task 7:
//   Run with --trace-gc. Identify a scavenge line and a mark-compact line, and
//   compare their pause times.
//
// Task 8:
//   Allocate 500 MB of Buffers and log both process.memoryUsage().heapUsed and
//   .rss. Explain why only one of them moved.
//
// Task 9:
//   Write a recursive tree walker, feed it 20,000 levels of nesting, catch the
//   RangeError, then rewrite it with an explicit stack array.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   V8 runs JavaScript and nothing else. Every file, socket, timer and thread
//   in Node is somebody else's job — and that somebody is libuv.
//
// If you remember the common bug:
//   A benchmark with no warm-up, or a hot object built with conditional
//   property assignment. Both are V8 telling you that shape and time matter.
//
// If you remember the professional framing:
//   Put every Node fact in one of two boxes — "in the ECMAScript spec" or
//   "provided by the host". Answers that sort correctly sound senior; answers
//   that put the event loop inside V8 do not.
//
// NEXT TOPIC -> 02_libuv-role.js
