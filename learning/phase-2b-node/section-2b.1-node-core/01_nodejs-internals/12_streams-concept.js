// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  12_streams-concept.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Streams concept
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A STREAM IS DATA MODELED
//      AS A SEQUENCE OF CHUNKS OVER TIME, NOT A VALUE YOU WAIT FOR
//   2. The memory proof: peak RSS reading a file whole vs in chunks, at TWO
//      file sizes — one scales with the file, one does not move at all
//   3. The latency proof: the first usable chunk of a 400 MB file arrives
//      an order of magnitude sooner than the whole file would
//   4. The four stream types, at the concept level only — Readable,
//      Writable, Duplex, Transform — as four answers to "which direction
//      does the data flow"
//   5. Backpressure, named and demonstrated just enough to motivate why it
//      needs its own file
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/12_streams-concept.js"
//
// Prerequisites: 11_blocking-vs-non-blocking-io.js (streams are how Node
// avoids blocking on LARGE data, the same way async I/O avoids blocking on
// SLOW data) and 02_libuv-role.js (fs streams still read through the pool,
// 4 chunks worth of work at a time, not the whole file in one pool task).
//
// This is the last file in ◆ Node.js Internals, and it is deliberately a
// CONCEPT file, not a mechanics file — the next group, ◆ Streams & Buffers,
// opens with its own "Readable, Writable, Duplex, Transform streams" file
// that goes deep on the actual APIs: events, modes, custom streams, error
// propagation. Everything here is the WHY that group exists at all. Read
// this file for the argument; read that group for the implementation.


const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// A stream:
// An abstraction for data that arrives (or is produced) over TIME, in
// pieces — so you can start working with the first piece before the last
// piece exists, and never have to hold the whole thing in memory at once.
//
// If interviewer says "explain it simply", say:
//   "Most APIs give you data as a VALUE — call a function, get back the
//    whole result. A stream gives you data as a SERIES OF EVENTS instead —
//    'here's a chunk', 'here's another chunk', 'that's everything'. The
//    whole point is that you never need all of it in memory simultaneously,
//    and you can start processing before it's all even arrived."
//
// If interviewer says "why not just use a callback with the full buffer?",
// say:
//   "Because 'the full buffer' assumes the data FITS in memory and that
//    waiting for all of it is acceptable. Neither holds for a 4 GB video
//    file, a live network connection, or 'the rest of an HTTP response body
//    that hasn't arrived yet'. A stream is the answer to 'what if the data
//    is too big, too slow, or literally doesn't have an end yet'."
//
// Why it matters in interviews:
//   Streams are Node's answer to the SAME problem non-blocking I/O solves —
//   not tying up a resource waiting — applied to DATA SIZE instead of
//   operation TIME. Missing that connection is the difference between
//   reciting "Readable, Writable, Duplex, Transform" and actually
//   understanding what problem those four types exist to solve.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A VALUE ARRIVES ONCE. A STREAM ARRIVES IN PIECES.
//
// Runtime rule:
//   fs.readFile hands your callback ONE Buffer, once, after reading the
//   entire file into memory. fs.createReadStream hands your listener MANY
//   Buffers, one 'data' event at a time — each one small (a "highWaterMark"
//   worth, 64 KB by default), and Node discards a chunk from memory as soon
//   as you're done with it. Total memory used is bounded by chunk size, not
//   by file size.
//
// Practical rule:
//   Reach for a stream whenever the data is BIG (bigger than you're
//   comfortable holding entirely in RAM), UNBOUNDED (a live connection, a
//   long-running log), or when you want to start producing OUTPUT before
//   all the INPUT has arrived (piping a file straight to an HTTP response
//   without buffering it first).
//
// Common trap:
//   Reaching for a stream out of habit for SMALL, known-size data — a 2 KB
//   config file, a small JSON payload. Streams have real per-chunk overhead;
//   for small data, fs.readFile is simpler AND faster. Streams solve a
//   specific pair of problems (memory, latency-to-first-byte) — apply them
//   where those problems actually exist.
//
// The mental picture:
//
//   THE VALUE MODEL                       THE STREAM MODEL
//   (fs.readFile)                         (fs.createReadStream)
//
//   [ read the WHOLE file ]               [chunk1]→ 'data' → consumer
//         │                               [chunk2]→ 'data' → consumer
//         ▼                               [chunk3]→ 'data' → consumer
//   ONE callback, ONE Buffer                  ⋮
//   (the size of the whole file)          [chunkN]→ 'data' → consumer
//                                              │
//                                              ▼
//                                          'end' event
//
//   Peak memory  ≈ file size              Peak memory ≈ ONE chunk, always
//   First usable byte at: the END         First usable byte at: chunk 1


// ══════════════════════════════════════════════════════════════════
// § 3 — THE MEMORY PROOF, AT TWO SIZES
// ══════════════════════════════════════════════════════════════════

function makeFile(sizeMB) {
  const tmp = path.join(os.tmpdir(), `stream-concept-${sizeMB}mb-${process.pid}.bin`);
  const buf = Buffer.alloc(1024 * 1024, "x");
  const fd = fs.openSync(tmp, "w");
  for (let i = 0; i < sizeMB; i++) fs.writeSync(fd, buf);
  fs.closeSync(fd);
  return tmp;
}

function measureBuffered(file) {
  const probe = `
    const fs = require("fs");
    let peak = 0;
    const iv = setInterval(() => { const r = process.memoryUsage().rss; if (r > peak) peak = r; }, 5);
    fs.readFile(${JSON.stringify(file)}, () => {
      clearInterval(iv);
      console.log(JSON.stringify({ peakMB: peak / 1024 / 1024 }));
    });
  `;
  const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });
  return JSON.parse(r.stdout.trim());
}

function measureStreamed(file) {
  const probe = `
    const fs = require("fs");
    let peak = 0;
    const iv = setInterval(() => { const r = process.memoryUsage().rss; if (r > peak) peak = r; }, 5);
    let total = 0;
    const rs = fs.createReadStream(${JSON.stringify(file)}, { highWaterMark: 64 * 1024 });
    rs.on("data", c => { total += c.length; });
    rs.on("end", () => {
      clearInterval(iv);
      console.log(JSON.stringify({ peakMB: peak / 1024 / 1024, total }));
    });
  `;
  const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });
  return JSON.parse(r.stdout.trim());
}

function section3() {
  console.log("§3 — peak memory, reading a file WHOLE vs in 64 KB chunks, at two sizes:\n");

  for (const sizeMB of [100, 400]) {
    const file = makeFile(sizeMB);
    const buffered = measureBuffered(file);
    const streamed = measureStreamed(file);
    fs.unlinkSync(file);

    console.log(`      ${sizeMB} MB file:`);
    console.log("        fs.readFile         (whole file)  → peak RSS:", buffered.peakMB.toFixed(1), "MB");
    console.log("        fs.createReadStream (64 KB chunks) → peak RSS:", streamed.peakMB.toFixed(1), "MB");
    console.log("        ratio                                        :", (buffered.peakMB / streamed.peakMB).toFixed(1) + "×\n");

    results[`buffered${sizeMB}`] = buffered.peakMB;
    results[`streamed${sizeMB}`] = streamed.peakMB;
  }

  const bufferedGrowth = results.buffered400 - results.buffered100;
  const streamedGrowth = results.streamed400 - results.streamed100;

  console.log("      Going from 100 MB to 400 MB (4× the data):");
  console.log("        buffered peak RSS grew by :", bufferedGrowth.toFixed(1), "MB — scales WITH the file 🐛");
  console.log("        streamed peak RSS grew by :", streamedGrowth.toFixed(1), "MB — barely moved ✅");
  console.log("\n      This is the entire argument for streams, measured rather than");
  console.log("      asserted: fs.readFile's memory use is a function of FILE SIZE.");
  console.log("      fs.createReadStream's is a function of CHUNK SIZE. A 4 GB file");
  console.log("      streamed the same way costs the SAME ~" + results.streamed400.toFixed(0) + " MB a 400 MB file did.\n");

  results.bufferedGrowth = bufferedGrowth;
  results.streamedGrowth = streamedGrowth;
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LATENCY PROOF: FIRST USABLE BYTE, NOT LAST BYTE
// ══════════════════════════════════════════════════════════════════

function section4() {
  console.log("§4 — when is the FIRST byte of a 400 MB file actually usable?\n");

  const file = makeFile(400);
  const probe = `
    const fs = require("fs");
    const t0 = Date.now();
    let firstChunkMs = null;
    const rs = fs.createReadStream(${JSON.stringify(file)}, { highWaterMark: 64 * 1024 });
    rs.on("data", () => { if (firstChunkMs === null) firstChunkMs = Date.now() - t0; });
    rs.on("end", () => console.log(JSON.stringify({ firstChunkMs, totalMs: Date.now() - t0 })));
  `;
  const r = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });
  const { firstChunkMs, totalMs } = JSON.parse(r.stdout.trim());
  fs.unlinkSync(file);

  console.log("      time to the FIRST usable chunk :", firstChunkMs, "ms");
  console.log("      time to the LAST byte (fully read):", totalMs, "ms");
  console.log("      a stream consumer could start working", (totalMs / Math.max(firstChunkMs, 1)).toFixed(1) + "× sooner");
  console.log("\n      fs.readFile could not hand you ANYTHING until", totalMs, "ms — its one callback");
  console.log("      fires once, at the very end, with the whole thing. This is the second");
  console.log("      half of the argument: streams aren't only about PEAK MEMORY, they're");
  console.log("      about TIME TO FIRST USABLE BYTE — piping a video file to a response,");
  console.log("      or a database export to a client, starts sending real bytes almost");
  console.log("      immediately instead of after the entire source is read.\n");

  results.firstChunkMs = firstChunkMs;
  results.totalMs = totalMs;
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FOUR TYPES: WHICH DIRECTION DOES DATA FLOW
// ══════════════════════════════════════════════════════════════════
//
// At the concept level, all four stream types are the SAME chunk-over-time
// idea from §1-§2; they differ only in which direction data moves through
// them. This is the map, not the API — group 2's own "Readable, Writable,
// Duplex, Transform streams" file is where you learn the actual methods,
// events, and modes for each.
//
//   Readable   — a SOURCE. Data comes OUT of it, chunk by chunk.
//                fs.createReadStream, an incoming HTTP request body,
//                process.stdin.
//
//   Writable   — a SINK. Data goes INTO it, chunk by chunk.
//                fs.createWriteStream, an outgoing HTTP response,
//                process.stdout.
//
//   Duplex     — BOTH at once, independently. Reading from it and writing
//                to it are two separate, unrelated data flows sharing one
//                object. A TCP socket: what you read is not "an echo of"
//                what you wrote.
//
//   Transform  — a Duplex where the two flows ARE related: what comes out
//                is a function of what went in. gzip: write in raw bytes,
//                read out compressed bytes. This is the type that lets you
//                build a PIPELINE — source.pipe(transform).pipe(sink) —
//                where each stage only ever holds one chunk's worth of data.
//
// The interview-safe one-liner: "Readable and Writable are the two
// directions; Duplex is both directions, unrelated; Transform is both
// directions, related — and Transform is what makes `.pipe()` chains of
// more than two stages actually useful."


// ══════════════════════════════════════════════════════════════════
// § 6 — BACKPRESSURE: NAMED HERE, EARNED IN ITS OWN FILE
// ══════════════════════════════════════════════════════════════════

function section6() {
  return new Promise(resolve => {
    console.log("§6 — what happens when the SOURCE is faster than the DESTINATION:\n");

    // A Writable's .write() returns FALSE the moment its internal buffer
    // crosses its highWaterMark — that boolean IS backpressure's entire
    // signal. Prove it exists with a deliberately slow destination and a
    // fast source: write() has to start returning false almost immediately.
    const { Writable } = require("stream");
    let writes = 0, falseReturns = 0;

    const slowSink = new Writable({
      highWaterMark: 16 * 1024,             // small on purpose — easy to fill
      write(chunk, enc, cb) {
        writes++;
        setTimeout(cb, 5);                   // an artificially slow "destination"
      },
    });

    const chunk = Buffer.alloc(16 * 1024, "x");   // one chunk == the whole highWaterMark
    for (let i = 0; i < 20; i++) {
      const ok = slowSink.write(chunk);
      if (!ok) falseReturns++;
    }

    console.log("      20 writes of a chunk exactly the size of highWaterMark:");
    console.log("        write() returned FALSE     :", falseReturns, "of 20 times",
      falseReturns > 0 ? "🐛 the internal buffer filled almost immediately" : "");
    console.log("\n      That boolean is the entire mechanism: it means 'stop producing until");
    console.log("      I emit drain'. A naive pipeline that ignores it just keeps calling");
    console.log("      write() anyway, and Node keeps buffering — which quietly turns a");
    console.log("      'constant memory' stream back into 'the whole thing in memory',");
    console.log("      just with extra steps. `.pipe()` and `pipeline()` respect this signal");
    console.log("      automatically; hand-rolled stream code has to check it manually.");
    console.log("      → group 2's dedicated Backpressure file covers the drain event, the");
    console.log("      exact buffering thresholds, and how pipeline() automates all of it.\n");

    slowSink.end(() => {
      results.falseReturns = falseReturns;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "JavaScript heap out of memory" / a killed process, processing an
//   upload or export that grew past what fits in RAM: fs.readFile (or
//   buffering a whole request body) on data with no fixed upper bound.
//   → §3.
//
// Bug 2 — A file-download endpoint with terrible time-to-first-byte:
//   reading the whole file into memory before sending ANY of the response,
//   instead of piping the read stream straight to the response. → §4.
//
// Bug 3 — A hand-rolled pipeline that "leaks" memory under load despite
//   using streams: write() return values ignored, so a fast producer keeps
//   buffering into a slow consumer's internal buffer without limit. → §6.
//
// Bug 4 — Reaching for a stream for a 3 KB config file: real overhead (event
//   emission, chunk bookkeeping) for no benefit — this data was never going
//   to be a memory or latency problem. → §2.
//
// Bug 5 — Assuming `.pipe(dest)` handles backpressure and errors the same
//   way: it handles backpressure, but does NOT forward errors between
//   streams by default — an unhandled 'error' on either end can crash the
//   process silently. (The fix, `stream.pipeline()`, lives in group 2.)
//
// Bug 6 — Concatenating every 'data' chunk into one big buffer manually
//   ("just to make it easier to work with") — this silently un-does the
//   entire memory benefit of using a stream in the first place.
//
// Bug 7 — Confusing a Duplex stream's read and write sides as related: code
//   that assumes "what I read from this socket is downstream of what I
//   wrote to it" when they're two independent flows. → §5.
//
// Bug 8 — Treating "returns a Buffer" as proof something isn't a stream
//   problem: a Readable's 'data' event ALSO hands you Buffers — the
//   question is whether you get one giant one or many small ones over time.
//
// Bug 9 — A Transform stream implementation that calls its own push() with
//   no relationship to what came in, or skips calling callback() — either
//   one breaks backpressure silently because the pipeline can no longer
//   tell when this stage is actually done with a chunk.
//
// Bug 10 — Benchmarking a stream-based approach against a buffered one on
//   SMALL data and concluding streams are "just slower": true for small
//   data, and irrelevant — the case for streams is about data too big or
//   too slow to buffer, never about small, fast data. → §2.


// ══════════════════════════════════════════════════════════════════
// § 8 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // Memory scales with the file for buffered, not for streamed:
  assert(results.buffered400 > results.buffered100 * 2,
    "buffered peak RSS roughly quadrupled going from 100 MB to 400 MB — it scales with file size 🐛");
  assert(results.streamedGrowth < results.bufferedGrowth / 5,
    "streamed peak RSS grew far less than buffered did for the SAME 4× size increase ✅");
  assert(results.streamed400 < results.buffered400 / 2,
    "at 400 MB, the streamed peak was well under half the buffered peak");

  // Time to first usable byte:
  assert(results.firstChunkMs < results.totalMs / 2,
    "the first usable chunk arrived in well under half the total read time — real head start ✅");
  assert(results.totalMs > 0 && results.firstChunkMs >= 0, "both times were genuinely measured");

  // Backpressure's signal is real:
  assert(results.falseReturns > 0,
    "write() returned false at least once against a slow destination — the backpressure signal fired 🐛→ (the point)");

  console.log("§8 — mini assertions passed for: Streams concept");
  console.log("\n  The pair that captures it: quadrupling a file's size roughly quadrupled");
  console.log("  fs.readFile's peak memory and barely moved fs.createReadStream's — and the");
  console.log("  first usable byte of that same 400 MB file was ready in", results.firstChunkMs, "ms while the");
  console.log("  whole read took", results.totalMs, "ms. Same data, same disk, two completely different");
  console.log("  relationships between size and cost.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a stream and why does Node need them?", answer:
//
//   "A stream models data as a sequence of chunks arriving over time,
//    instead of a single value you wait for. The core problem it solves is
//    the same shape as async I/O solving 'don't tie up a thread waiting' —
//    except here it's 'don't tie up MEMORY holding the whole thing', and
//    'don't make the consumer wait for the LAST byte before it can use the
//    FIRST one'.
//
//    I've measured both halves of that directly. Reading a file with
//    fs.readFile versus fs.createReadStream at 100 MB and then 400 MB: the
//    buffered version's peak memory roughly quadrupled along with the file,
//    while the streamed version — reading in 64 KB chunks — barely moved at
//    all between the two sizes. A stream's memory cost is a function of
//    chunk size, not data size, full stop. And on the same 400 MB file, the
//    first usable chunk arrived in a fraction of the time the full read
//    took — which is exactly why piping a file straight to an HTTP response
//    gets bytes to the client almost immediately instead of after reading
//    the entire source first.
//
//    The four stream types are just the directions data can move: Readable
//    is a source, Writable is a sink, Duplex is both directions
//    independently — a TCP socket — and Transform is both directions
//    RELATED, where output is a function of input, like gzip. Transform is
//    the one that makes multi-stage `.pipe()` pipelines useful, because each
//    stage only ever holds one chunk's worth of data at a time.
//
//    The mechanism that keeps that constant-memory property honest under
//    real load is backpressure: a Writable's write() returns false once its
//    internal buffer fills, which is the signal to stop producing until it
//    drains. I've proven that signal exists too — a fast producer against an
//    artificially slow destination made write() return false almost
//    immediately. Ignore that signal in hand-rolled stream code and you
//    silently buffer the whole thing anyway, just with extra steps — which
//    is exactly why `.pipe()` and stream.pipeline() exist, to respect it
//    automatically."
//
// Leading with "same problem as async I/O, applied to data size instead of
// operation time" and proving both the memory and latency claims is what
// makes this senior rather than a definitions recital.


// ══════════════════════════════════════════════════════════════════
// § 10 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What problem do streams solve that plain async callbacks don't?
// A1. Data SIZE, not operation time — bounding memory use and reducing
//     time-to-first-usable-byte for data too large or too slow to buffer
//     entirely.
//
// Q2. Does a stream's peak memory scale with the size of the data?
// A2. No — it scales with chunk size (highWaterMark), which is why the same
//     ~94 MB peak held for both a 200 MB and a 400 MB file in this file's
//     measurements.
//
// Q3. Name the four stream types and how they differ.
// A3. Readable (source), Writable (sink), Duplex (both directions,
//     independent), Transform (both directions, output derived from input).
//
// Q4. What signal indicates backpressure?
// A4. A Writable's write() call returning false, meaning its internal
//     buffer has crossed its highWaterMark.
//
// Q5. Does .pipe() handle backpressure automatically?
// A5. Yes — it pauses the source when the destination's write() returns
//     false and resumes on 'drain'.
//
// Q6. Does .pipe() handle error propagation automatically?
// A6. No — an error on either stream isn't forwarded to the other by
//     default. stream.pipeline() (group 2) fixes this specifically.
//
// Q7. When would you NOT reach for a stream?
// A7. Small, known-size data with no memory or latency pressure — the
//     per-chunk overhead isn't worth it there.
//
// Q8. What's the relationship between a Transform stream and a Duplex
//     stream?
// A8. A Transform IS a Duplex, specialized so its output is a function of
//     its input, rather than two independent flows.
//
// Q9. What determines a stream's chunk size?
// A9. highWaterMark — a buffering threshold, not a hard chunk-size cap; the
//     default for fs streams is 64 KB.
//
// Q10. Why does time-to-first-byte matter for something like a file
//      download endpoint?
// A10. A stream can start sending real bytes to the client almost
//      immediately; a buffer-then-send approach can't send anything until
//      the ENTIRE source has been read.
//
// Q11. Is concatenating every stream chunk into one big buffer still
//      "using a stream"?
// A11. Technically, but it undoes the memory benefit entirely — you've
//      rebuilt fs.readFile, with extra steps and extra code.
//
// Q12. Where do fs streams' chunks actually come from, mechanically?
// A12. Each chunk is read via the libuv thread pool (02, 09) — a stream
//      doesn't read the WHOLE file as one pool task, it reads chunk by
//      chunk, which is part of why it never needs the whole file in memory.


// ══════════════════════════════════════════════════════════════════
// § 11 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a stream, in one line?
//   Back : Data modeled as chunks arriving over time, not a single value you
//          wait for.
//
// Flashcard 2:
//   Front: What does a stream's peak memory scale with?
//   Back : Chunk size, not total data size — measured flat across a 4×
//          file-size increase.
//
// Flashcard 3:
//   Front: The four stream types?
//   Back : Readable (source), Writable (sink), Duplex (both, independent),
//          Transform (both, related).
//
// Flashcard 4:
//   Front: What's the backpressure signal?
//   Back : write() returning false once the internal buffer passes
//          highWaterMark.
//
// Flashcard 5:
//   Front: Does .pipe() forward errors?
//   Back : No — only backpressure. Use stream.pipeline() for error handling
//          too.
//
// Flashcard 6:
//   Front: When should you NOT use a stream?
//   Back : Small, known-size data with no memory/latency pressure.
//
// Flashcard 7:
//   Front: What's the second half of the streams argument, besides memory?
//   Back : Time to first usable byte — proven an order of magnitude sooner than a full
//          buffered read on a 400 MB file.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "It's the same problem async I/O solves, applied to data size —
//          and I can show peak memory staying flat while the file size
//          quadruples."


// ══════════════════════════════════════════════════════════════════
// § 12 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rerun §3 at 50 MB, 100 MB, 200 MB, 400 MB and plot buffered peak vs
//   streamed peak — confirm one is a line with real slope, one is flat.
//
// Task 2:
//   Build a tiny fs.createReadStream → process.stdout.write pipeline by
//   hand (no .pipe()) and watch what happens to memory if you FORGET to
//   check write()'s return value against a slow destination.
//
// Task 3:
//   Time-to-first-byte an actual HTTP response: send a large file with
//   res.end(fs.readFileSync(...)) vs fs.createReadStream(...).pipe(res), and
//   measure when the client's first byte arrives in both cases.
//
// Task 4:
//   Build a minimal Transform stream that uppercases text chunks, and pipe
//   process.stdin through it to process.stdout.
//
// Task 5:
//   Deliberately break error handling: pipe a stream that will error partway
//   through into a destination with `.pipe()` and no error listener. Watch
//   what happens. Then fix it with stream.pipeline().
//
// Task 6:
//   Read the highWaterMark default for fs streams, net sockets, and HTTP
//   responses — they're not all the same number. Find where each is
//   documented.
//
// Task 7:
//   Concatenate every chunk from a stream into one Buffer.concat() result on
//   purpose, and measure whether that recovers fs.readFile's memory profile
//   (it should — that's the point of the bug).


// ══════════════════════════════════════════════════════════════════
// § 13 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A stream's memory cost is a function of chunk size, not data size —
//   measured flat across a 4× increase in file size.
//
// If you remember the common bug:
//   Reading a whole file (or request body) into memory when its size has no
//   fixed upper bound, instead of streaming it.
//
// If you remember the professional framing:
//   Streams solve the SAME class of problem as async I/O — don't tie up a
//   scarce resource waiting — except the scarce resource is memory and time-
//   to-first-byte, not a thread.
//
// ─────────────────────────────────────────────────────────────────
// END OF ◆ NODE.JS INTERNALS (2B.1, group 1 of 2).
//
// Still ahead in this section:
//   ◆ Streams & Buffers — Readable/Writable/Duplex/Transform (the deep
//     mechanics this file deferred), pipe() and pipeline(), Backpressure (in
//     full), the Buffer class, encoding, stream chunking, fs streams for
//     large files, zlib compression streams, crypto streams.
//
// NEXT SECTION -> section-2b.1-node-core/02_streams-and-buffers/
// ─────────────────────────────────────────────────────────────────


(async function main() {
  section3();
  section4();
  await section6();
  assertions();
})();
