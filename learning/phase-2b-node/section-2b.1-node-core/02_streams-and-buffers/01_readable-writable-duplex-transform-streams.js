// ╔══════════════════════════════════════════════════════════════════╗
// ║   Streams & Buffers  →  01_readable-writable-duplex-transform-streams.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Readable, Writable, Duplex, Transform
//   streams
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A STREAM CLASS IS AN
//      INTERFACE OVER TWO PRIMITIVE OPERATIONS — push() and _write() —
//      EVERYTHING ELSE IS BUILT FROM THOSE TWO
//   2. Paused vs flowing mode, and the exact moment a Readable switches —
//      proven with `readableFlowing`, not inferred
//   3. Building all four types FROM SCRATCH — a Readable, a Writable, a
//      Duplex with independent flows, a Transform with related ones
//   4. Object mode: why it exists, and what happens when you skip it and
//      push a plain object anyway
//   5. The event order a Writable actually fires — finish, close, and the
//      write callback, in the order Node fires them, not the order you'd
//      guess
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/02_streams-and-buffers/01_readable-writable-duplex-transform-streams.js"
//
// Prerequisites: 01_nodejs-internals/12_streams-concept.js — that file
// proved WHY streams exist (constant memory, fast time-to-first-byte) and
// sketched these four types at the concept level. This file is the promised
// deep dive: the actual base classes, the actual methods you implement, and
// the actual events you can rely on.
//
// 12 said "Readable is a source, Writable is a sink, Duplex is both
// independently, Transform is both related" and left it there. Everything
// below is what that sentence looks like as running code — including the
// two mistakes (skipping object mode, guessing event order) that show up
// the moment someone builds a custom stream for the first time.


const { Readable, Writable, Duplex, Transform } = require("stream");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Readable / Writable / Duplex / Transform:
// Four base classes, all built on the same two primitives — a Readable
// produces chunks via push(), a Writable consumes chunks via _write() — and
// Duplex and Transform are just combinations of those two primitives in one
// object, independent or linked.
//
// If interviewer says "explain it simply", say:
//   "There are really only two jobs: producing data (push) and consuming
//    data (_write). Readable does the first job. Writable does the second.
//    Duplex does BOTH jobs in one object, completely unrelated to each
//    other — like a socket, where what you read isn't a response to what
//    you wrote. Transform also does both, but wires them together: whatever
//    you write becomes the input to whatever gets read back out."
//
// If interviewer says "how do you build a custom one?", say:
//   "You extend the base class and implement ONE method. Readable needs
//    _read() — inside it, you call this.push(chunk) with data, or
//    push(null) when you're done. Writable needs _write(chunk, enc,
//    callback) — do something with chunk, then call callback() to signal
//    you're ready for the next one. Transform needs _transform(chunk, enc,
//    callback) — call callback(null, output) instead of callback()."
//
// Why it matters in interviews:
//   Anyone can recite "Readable, Writable, Duplex, Transform". Being able to
//   IMPLEMENT one from scratch — get push()/callback() right, get object
//   mode right — is the actual signal of having built something real with
//   streams instead of only consuming fs.createReadStream.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   PUSH FEEDS THE READ SIDE. _write DRAINS THE WRITE SIDE. THAT'S ALL FOUR.
//
// Runtime rule:
//   A Readable has an internal buffer. Your _read() implementation's ONLY
//   job is to call push(chunk) to fill that buffer (or push(null) to signal
//   "no more data, ever"). A Writable has its own internal buffer on the
//   other end; your _write() implementation's ONLY job is to drain one
//   chunk and call callback() when you're ready for the next. Duplex is
//   literally `class Duplex extends Readable { }` with Writable's methods
//   mixed in — two buffers, two independent halves. Transform is a Duplex
//   where _write's implementation (_transform) is also responsible for
//   pushing to the read side.
//
// Practical rule:
//   Readable/Writable are for I/O endpoints — a file, a socket, stdin,
//   stdout. Duplex is for something that reads and writes as genuinely
//   separate concerns — a socket again, or a database connection. Transform
//   is for anything IN BETWEEN two other streams — compression, encryption,
//   parsing, reformatting — which is why it's the type `.pipe()` chains of
//   more than two stages are built from.
//
// Common trap:
//   Calling push() from OUTSIDE _read(), on your own schedule, and expecting
//   it to behave like a queue with infinite room. push() DOES respect
//   backpressure — it returns false once the internal buffer is full, the
//   exact same signal write() gives (12 §6) — and calling it from outside
//   _read() means you have to track that signal yourself instead of relying
//   on the stream to call _read() again when it's ready.
//
// The mental picture:
//
//   READABLE                    WRITABLE
//   _read() → push(chunk)       _write(chunk, enc, cb) → … → cb()
//   _read() → push(chunk)       _write(chunk, enc, cb) → … → cb()
//   _read() → push(null)  ← end 'finish' ← end() called, all writes drained
//
//   DUPLEX = both, unrelated    TRANSFORM = both, LINKED
//   _read()  → push(A)          _write side IS _transform(chunk, enc, cb)
//   _write() → (does its own          cb(null, output) ──▶ push(output)
//               unrelated thing)      cb(null)          ──▶ nothing pushed
//   Two buffers, two stories     One call does both jobs at once


// ══════════════════════════════════════════════════════════════════
// § 3 — PAUSED VS FLOWING: PROVEN, NOT INFERRED
// ══════════════════════════════════════════════════════════════════

function makeCounter(max) {
  let i = 0;
  return new Readable({
    read() {
      if (i >= max) { this.push(null); return; }
      this.push(Buffer.from("chunk" + i + " "));
      i++;
    },
  });
}

function section3() {
  return new Promise(resolve => {
    console.log("§3 — a Readable has two modes, and `readableFlowing` names the switch:\n");

    const r1 = makeCounter(5);
    console.log("      before ANY listener        : readableFlowing =", r1.readableFlowing,
      "← null means 'paused, nobody asked yet'");

    const pulled = [];
    setImmediate(() => {
      let chunk;
      while ((chunk = r1.read()) !== null) pulled.push(chunk.toString().trim());
      console.log("      after manual .read() calls : pulled", pulled.length, "chunks by hand:", pulled.join(","));

      const r2 = makeCounter(5);
      console.log("\n      a FRESH stream, before 'data':", "readableFlowing =", r2.readableFlowing);

      const flowed = [];
      r2.on("data", c => flowed.push(c.toString().trim()));
      console.log("      the INSTANT 'data' is attached:", "readableFlowing =", r2.readableFlowing,
        "← flipped to true automatically");

      r2.on("end", () => {
        console.log("      chunks that arrived with ZERO manual .read() calls:", flowed.join(","));
        console.log("\n      Attaching a 'data' listener is not a passive subscription — it is");
        console.log("      the ACTUAL switch from paused to flowing mode. Before it, nothing");
        console.log("      moves unless you call .read() yourself. After it, the stream pulls");
        console.log("      from its own _read() as fast as your listener can keep up (and stops");
        console.log("      pulling if you .pause() it again — the same lever pipe() uses). \n");

        results.manualPulled = pulled;
        results.autoFlowed = flowed;
        results.flowingBefore = r2.readableFlowing;
        resolve();
      });
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — A CUSTOM READABLE AND WRITABLE, FROM SCRATCH
// ══════════════════════════════════════════════════════════════════

class LineCounter extends Readable {
  constructor(max) {
    super();
    this._i = 0;
    this._max = max;
  }
  _read() {
    if (this._i >= this._max) { this.push(null); return; }     // ← the ONLY way to end a Readable
    this.push(String(this._i) + "\n");
    this._i++;
  }
}

class Collector extends Writable {
  constructor() {
    super();
    this.collected = [];
  }
  _write(chunk, encoding, callback) {
    this.collected.push(chunk.toString());
    callback();                                                  // ← the ONLY way to ask for the next chunk
  }
}

function section4() {
  return new Promise(resolve => {
    console.log("§4 — the whole Readable/Writable contract in two tiny classes:\n");

    let readableOutput = "";
    new LineCounter(4)
      .on("data", d => (readableOutput += d))
      .on("end", () => {
        console.log("      custom Readable  (_read + push)         :", JSON.stringify(readableOutput));

        const collector = new Collector();
        collector.write("a");
        collector.write("b");
        collector.end("c", () => {
          console.log("      custom Writable  (_write + callback)    :", JSON.stringify(collector.collected));
          console.log("\n      Every fs.createReadStream, every net.Socket's read side, every");
          console.log("      third-party streaming library — all of it bottoms out in exactly");
          console.log("      these two calls: push() to produce, callback() to say 'next'.\n");

          results.readableOutput = readableOutput;
          results.collected = collector.collected;
          resolve();
        });
      });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — DUPLEX: TWO INDEPENDENT FLOWS, ONE OBJECT
// ══════════════════════════════════════════════════════════════════

class DelayedEcho extends Duplex {
  constructor() {
    super();
    this._queue = [];
  }
  _write(chunk, encoding, callback) {
    this._queue.push(chunk);          // the WRITE side just stores what arrived
    callback();
  }
  _read() {
    if (this._queue.length) this.push(this._queue.shift());   // the READ side serves it back LATER
  }
}

function section5() {
  return new Promise(resolve => {
    console.log("§5 — Duplex: writing to it and reading from it are unrelated stories:\n");

    const d = new DelayedEcho();
    const readBack = [];

    d.on("data", c => readBack.push(c.toString()));

    d.write("first");
    d.write("second");
    d.write("third");

    setImmediate(() => {
      console.log("      wrote 3 chunks, read side (independently) produced:", readBack.join(", "));
      console.log("\n      This is exactly a TCP socket's shape: writing to it and the bytes");
      console.log("      you read from it are two SEPARATE streams sharing one object — what");
      console.log("      comes back is never 'a response to' what you sent, structurally");
      console.log("      speaking. (A real echo protocol only LOOKS related because the peer");
      console.log("      on the other end chose to send back what it received.)\n");

      results.duplexReadBack = readBack;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — TRANSFORM: THE SAME TWO FLOWS, DELIBERATELY LINKED
// ══════════════════════════════════════════════════════════════════

class Upper extends Transform {
  _transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());   // ← ONE call does BOTH jobs
  }
}

// Object mode: without it, a Transform enforces the same rule an ordinary
// Writable does — chunks must be a string, Buffer, TypedArray, or DataView.
// { objectMode: true } is the opt-in to push arbitrary JS values instead.
class ObjectDoubler extends Transform {
  constructor() {
    super({ objectMode: true });
  }
  _transform(obj, encoding, callback) {
    callback(null, { ...obj, value: obj.value * 2 });
  }
}

function section6() {
  return new Promise(resolve => {
    console.log("§6 — Transform links the two flows, and object mode is not optional:\n");

    let upperOut = "";
    const up = new Upper();
    up.on("data", c => (upperOut += c));
    up.on("end", () => {
      console.log("      Transform (binary mode) input 'abc'+'def' →", JSON.stringify(upperOut));

      const objectResults = [];
      const od = new ObjectDoubler();
      od.on("data", o => objectResults.push(o));
      od.on("end", () => {
        console.log("      Transform (object mode) doubling {value}s →", JSON.stringify(objectResults));

        // Now the failure: the SAME kind of object, through a Transform that
        // was NOT built with objectMode. Node enforces the type at write().
        let threwSync = null;
        try {
          const noObjectMode = new Transform({
            transform(o, enc, cb) { cb(null, o); },
          });
          noObjectMode.write({ id: 99 });   // 🐛 not a string/Buffer — throws synchronously
        } catch (e) {
          threwSync = e.constructor.name;
        }
        console.log("\n      the SAME shape of object, into a Transform WITHOUT objectMode:");
        console.log("        threw synchronously:", threwSync, threwSync === "TypeError" ? "🐛 — objectMode isn't optional for object data" : "");
        console.log("\n      This is why every object-streaming library — Node's own");
        console.log("      stream/consumers, most database driver row-streams — sets");
        console.log("      objectMode explicitly. Forgetting it isn't a silent bug; it's an");
        console.log("      immediate, synchronous TypeError the moment real data arrives.\n");

        results.upperOut = upperOut;
        results.objectResults = objectResults;
        results.threwSync = threwSync;
        resolve();
      });
      od.write({ id: 1, value: 10 });
      od.write({ id: 2, value: 20 });
      od.end();
    });
    up.write("abc");
    up.end("def");
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE EVENT ORDER A WRITABLE ACTUALLY FIRES
// ══════════════════════════════════════════════════════════════════

function section7() {
  return new Promise(resolve => {
    console.log("§7 — end() callback, 'finish', and 'close' — in what order?\n");

    const order = [];
    const w = new Writable({
      write(chunk, enc, cb) { cb(); },
    });

    w.on("finish", () => order.push("finish"));      // all writes flushed, no more data will be written
    w.on("close", () => order.push("close"));         // the underlying resource is now gone

    w.end("last chunk", () => {
      order.push("end()'s own callback");
      setImmediate(() => {
        console.log("      order observed:", order.join(" → "));
        console.log("\n      A guess most people make: 'finish fires, then the end() callback,");
        console.log("      then close.' What actually happens: end()'s OWN callback is really");
        console.log("      just a one-time 'finish' listener registered for you — so it and");
        console.log("      'finish' are the same event, and 'close' — a SEPARATE event about");
        console.log("      the resource being fully torn down — comes after both. Relying on");
        console.log("      the wrong one to mean 'fully done, resource released' is a real");
        console.log("      source of 'file still locked' / 'socket still open' bugs.\n");

        results.eventOrder = order;
        resolve();
      });
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 8 — ERROR PROPAGATION, WITHIN ONE STREAM
// ══════════════════════════════════════════════════════════════════

function section8() {
  return new Promise(resolve => {
    console.log("§8 — how a single stream reports failure:\n");

    const r = new Readable({ read() {} });
    let caught = null;
    r.on("error", e => { caught = e.message; });
    r.destroy(new Error("synthetic failure"));

    setImmediate(() => {
      console.log("      r.destroy(new Error(...)) → 'error' event fired with:", JSON.stringify(caught));
      console.log("\n      destroy(err) is the correct way to fail a stream from the outside —");
      console.log("      it emits 'error' AND tears the stream down, rather than leaving it in");
      console.log("      a half-alive state. This is one stream reporting its own failure.");
      console.log("      What 'error' does NOT do by default is cross from one stream to");
      console.log("      ANOTHER one it's piped to — that gap, and its fix, is 02_pipe-and-");
      console.log("      pipeline.js's entire subject.\n");

      results.destroyErrorCaught = caught;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Attaching a 'data' listener "just to check something" and having
//   the stream start consuming data you weren't ready for yet: the listener
//   itself flips readableFlowing to true and starts the flow. → §3.
//
// Bug 2 — Calling .pause() and then still seeing 'data' events: pause()
//   only stops the AUTOMATIC flow; a 'data' listener plus a synchronous
//   push() from your own code can still deliver a chunk already in flight.
//
// Bug 3 — A custom Readable that never ends: forgetting push(null) in
//   _read(). The consumer waits on 'end' forever with no error, no timeout,
//   no clue.
//
// Bug 4 — A custom Writable that stalls forever: forgetting to call the
//   callback in _write(). No error — the stream just never asks for the
//   next chunk.
//
// Bug 5 — "TypeError: The 'chunk' argument must be of type string or an
//   instance of Buffer": pushing/writing a plain object into a stream built
//   without objectMode. → §6.
//
// Bug 6 — Code that treats a Duplex's read and write sides as request/
//   response: assuming what you read is "the answer to" what you wrote,
//   when they're structurally independent. → §5.
//
// Bug 7 — Cleanup code that runs on 'finish' but a file descriptor or
//   socket is still technically open: 'finish' means "no more writes will
//   happen", not "the resource is released" — that's 'close'. → §7.
//
// Bug 8 — A Transform's _transform() that calls both push() manually AND
//   passes a value to callback(): double-delivers the same logical chunk,
//   or fights the internal buffering — pick ONE mechanism per chunk.
//
// Bug 9 — Assuming .destroy() without an error argument reports failure:
//   destroy() with no argument is a clean shutdown, no 'error' event.
//   destroy(err) is the one that fires 'error'. → §8.
//
// Bug 10 — A "Duplex" that's really just meant to transform data, built by
//   hand instead of using Transform: reimplementing the linking logic
//   Transform already gives you for free, usually incorrectly.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // Paused vs flowing:
  assert(results.manualPulled.length === 5 && results.manualPulled.join(",") === "chunk0,chunk1,chunk2,chunk3,chunk4",
    "manual .read() calls pulled every chunk, in order, with zero 'data' listener");
  assert(results.flowingBefore === true,
    "attaching 'data' flipped readableFlowing to true — the mode switch is the listener itself ✅");
  assert(results.autoFlowed.join(",") === results.manualPulled.join(","),
    "…and the SAME five chunks arrived automatically, no .read() calls needed");

  // Custom Readable/Writable:
  assert(results.readableOutput === "0\n1\n2\n3\n",
    "a custom Readable built from push()+push(null) produced exactly the expected 4 lines");
  assert(results.collected.join(",") === "a,b,c",
    "a custom Writable built from _write()+callback() collected exactly what was written, in order");

  // Duplex:
  assert(results.duplexReadBack.join(",") === "first,second,third",
    "a custom Duplex's independent read side served back everything written to its write side, in order");

  // Transform + object mode:
  assert(results.upperOut === "ABCDEF", "a binary-mode Transform uppercased both writes correctly");
  assert(results.objectResults.length === 2 && results.objectResults[0].value === 20 && results.objectResults[1].value === 40,
    "an object-mode Transform doubled each object's `value` field, preserving shape");
  assert(results.threwSync === "TypeError",
    "the IDENTICAL object shape, through a Transform WITHOUT objectMode, threw synchronously 🐛");

  // Event order:
  assert(results.eventOrder[0] === "end()'s own callback" && results.eventOrder[1] === "finish",
    "end()'s callback and 'finish' fire together, back to back — they are effectively the same event");
  assert(results.eventOrder[2] === "close",
    "…and 'close' — a genuinely separate event — always comes after both");

  // Error:
  assert(results.destroyErrorCaught === "synthetic failure",
    "destroy(err) reliably emitted 'error' with the exact message passed in");

  console.log("§10 — mini assertions passed for: Readable, Writable, Duplex, Transform streams");
  console.log("\n  The pair that captures it: the SAME object shape flowed cleanly through an");
  console.log("  object-mode Transform and threw a synchronous TypeError through one that");
  console.log("  wasn't — and a Duplex's read side served back three writes in order with");
  console.log("  zero code connecting the two sides, because none was ever required to.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "explain Readable, Writable, Duplex, and Transform streams",
// answer:
//
//   "They all reduce to two primitives. A Readable's job is to call
//    push(chunk) to fill its internal buffer, and push(null) when there's no
//    more data — that's the entire contract, implemented in _read(). A
//    Writable's job is to drain one chunk in _write(chunk, encoding,
//    callback) and call callback() when it's ready for the next one.
//
//    Duplex is both of those in one object, genuinely independent — I built
//    one where the write side just queues chunks and the read side serves
//    them back later, on its own schedule, with zero logic connecting the
//    two. That's the actual shape of a TCP socket: what you read isn't a
//    response to what you wrote, structurally, even when a protocol on top
//    makes it look that way.
//
//    Transform is the same two primitives, DELIBERATELY linked: instead of
//    a separate _read() and _write(), you implement _transform(chunk,
//    encoding, callback), and calling callback(null, output) does both
//    jobs — consumes the input chunk and pushes the output chunk — in one
//    call. That's what makes multi-stage pipe() chains work: each Transform
//    stage only ever holds one chunk at a time.
//
//    Two things I'd flag from actually building these. First, a Readable has
//    two real modes, and the switch is the 'data' listener itself —
//    readableFlowing goes from null to true the instant you attach one; if
//    you're not ready to consume yet, don't attach it, or call .pause().
//    Second, object mode isn't optional set-dressing — write a plain object
//    into a stream that wasn't built with objectMode: true and it throws a
//    synchronous TypeError immediately, not a silent failure. I've triggered
//    that on purpose to be sure of the exact behavior rather than assuming
//    it.
//
//    And on cleanup: 'finish' fires when all writes are flushed, but the
//    resource itself — the file descriptor, the socket — isn't necessarily
//    released until 'close', a separate, later event. Code that treats
//    'finish' as 'fully done' is a common source of 'file still locked'
//    bugs."
//
// Leading with "two primitives, four combinations" and proving the object-
// mode failure and the finish/close ordering live is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What are the two primitive operations every stream reduces to?
// A1. push() on the read side, _write()+callback() on the write side.
//
// Q2. What ends a Readable stream?
// A2. Calling push(null) from inside _read().
//
// Q3. What happens if a Writable's _write() never calls its callback?
// A3. The stream stalls silently — no error, it just never requests the
//     next chunk.
//
// Q4. What's the structural difference between Duplex and Transform?
// A4. Duplex's read and write sides are independent. Transform's are
//     linked — one _transform() call does both jobs.
//
// Q5. What switches a Readable from paused to flowing mode?
// A5. Attaching a 'data' listener (or calling .resume()) — proven directly
//     via readableFlowing flipping from null to true.
//
// Q6. What happens if you write a plain object into a non-objectMode
//     stream?
// A6. A synchronous TypeError — not a silent coercion, not a delayed
//     failure.
//
// Q7. Does .destroy() always emit 'error'?
// A7. No — only destroy(err) with an error argument does. Bare destroy() is
//     a clean shutdown.
//
// Q8. What's the difference between 'finish' and 'close' on a Writable?
// A8. 'finish' means all writes have been flushed — no more data will be
//     accepted. 'close' means the underlying resource has actually been
//     released, and fires separately (typically after).
//
// Q9. Is end()'s callback the same as listening for 'finish'?
// A9. Effectively yes — end()'s callback is registered as a one-time
//     'finish' listener internally.
//
// Q10. Why is Transform the type multi-stage .pipe() chains are built from?
// A10. Because it can sit BETWEEN a source and a sink, transforming one
//      chunk at a time without ever holding the whole stream's worth of data.
//
// Q11. Can push() be called from outside _read()?
// A11. Yes, but then you're responsible for respecting its backpressure
//      signal (it returns false when the buffer is full) yourself, instead
//      of relying on the stream to call _read() again automatically.
//
// Q12. Why does a real socket "feel" request/response even though Duplex is
//      structurally independent?
// A12. Because the PROTOCOL on top (HTTP, a custom RPC framing) creates that
//      relationship deliberately — Duplex itself makes no such promise.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The two primitives every stream reduces to?
//   Back : push() (Readable) and _write()+callback() (Writable).
//
// Flashcard 2:
//   Front: How do you end a custom Readable?
//   Back : push(null) inside _read().
//
// Flashcard 3:
//   Front: Duplex vs Transform, structurally?
//   Back : Duplex: independent read/write. Transform: one _transform() call
//          links both.
//
// Flashcard 4:
//   Front: What flips a Readable to flowing mode?
//   Back : Attaching a 'data' listener (or .resume()) — readableFlowing:
//          null → true.
//
// Flashcard 5:
//   Front: What happens writing an object without objectMode?
//   Back : A synchronous TypeError, immediately.
//
// Flashcard 6:
//   Front: finish vs close on a Writable?
//   Back : finish = all writes flushed. close = resource actually released,
//          a separate later event.
//
// Flashcard 7:
//   Front: Does bare .destroy() emit 'error'?
//   Back : No — only destroy(err) does.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Every stream type is push() and callback() in different
//          combinations — Duplex keeps them apart, Transform links them."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build a Readable that emits the Fibonacci sequence, one number per
//   push(), stopping after 10 values.
//
// Task 2:
//   Build a Writable that writes to an in-memory array AND logs its own
//   backpressure: check write()'s return value and log when it's false.
//
// Task 3:
//   Build a Duplex that behaves like a real echo: whatever is written
//   becomes readable back out, in order — then explain why that's
//   basically a Transform with extra steps.
//
// Task 4:
//   Build an object-mode Transform that filters objects (drops any where
//   value < 0) instead of transforming every one — note that _transform can
//   call callback(null) with no second argument to push NOTHING for a chunk.
//
// Task 5:
//   Attach 'data' to a stream, immediately call .pause(), and log the next
//   3 events. Confirm data delivery actually stops.
//
// Task 6:
//   Write a custom Writable that calls its _write() callback with an Error
//   sometimes. Confirm which event fires (finish? close? error?) and in what
//   order relative to already-successful writes.
//
// Task 7:
//   Time how long push()ing 100,000 tiny chunks from a custom Readable takes
//   vs push()ing 100 chunks 1,000× the size, for the same total data —
//   quantify per-chunk overhead yourself.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Every stream is push() and _write()+callback() in different
//   arrangements — Duplex keeps the two independent, Transform links them
//   with one call.
//
// If you remember the common bug:
//   A plain object pushed into a stream that was never given objectMode:
//   true — a synchronous TypeError, not a silent failure.
//
// If you remember the professional framing:
//   'finish' means no more writes; 'close' means the resource is actually
//   gone. Cleanup code that can't tell the difference leaks file handles
//   and sockets.
//
// NEXT TOPIC -> 02_pipe-and-pipeline.js


(async function main() {
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
