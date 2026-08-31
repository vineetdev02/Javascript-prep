// ╔══════════════════════════════════════════════════════════════════╗
// ║   Node.js Internals  →  07_child-process.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Child Process
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A CHILD PROCESS IS A
//      SEPARATE OS PROCESS — not a thread, not an isolate. Its own memory,
//      its own PID, and it can be a completely different program
//   2. The four ways to spawn one — spawn, exec, execFile, fork — and which
//      one command-injects itself if you get it wrong
//   3. fork()'s IPC channel, and the silent Buffer bug in its DEFAULT
//      serialization mode
//   4. The real cost: fork() vs a Worker Thread, measured to first message
//   5. Crash isolation is even stronger than a worker's — proved the same
//      way, plus exit codes and signals
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.1-node-core/01_nodejs-internals/07_child-process.js"
//
// Prerequisites: 06_worker-threads.js (the whole file is a comparison
// against it) and 02_libuv-role.js §8 (sync calls never reach libuv — this
// file's §7 is the process-level version of that same bug).
//
// File 06 drew a hard line: a Worker Thread duplicates the isolate and the
// loop but still shares the process. child_process does not share ANYTHING.
// It is Node reaching for the operating system's oldest trick — fork() the
// whole process, or exec() a brand new program — and every tradeoff below
// falls out of that one difference in blast radius.


const { spawn, exec, execFile, fork, spawnSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const results = {};

// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// child_process:
// Node's module for launching a separate operating-system process — its own
// PID, its own memory space, possibly not even JavaScript — and talking to it
// through streams, exit codes, signals, or (for fork() specifically) a
// message-passing IPC channel.
//
// If interviewer says "explain it simply", say:
//   "A Worker Thread is still inside my process. A child process is not — it
//    is a completely separate program the OS is running, and Node just holds
//    a handle to it: its stdin/stdout/stderr as streams, and an exit code
//    when it's done. It can be `ls`, `ffmpeg`, `python`, or another Node
//    script — the child doesn't have to be JavaScript at all."
//
// If interviewer says "when would you reach for this instead of a worker?",
// say:
//   "Whenever the work ISN'T my own JavaScript — running a CLI tool, a
//    different language's interpreter, or anything I want a hard crash
//    boundary around. And `fork()` specifically, for spinning up another
//    full Node process that needs its own event loop entirely, not just its
//    own thread."
//
// Why it matters in interviews:
//   This question tests whether you understand isolation as a SPECTRUM:
//   same-thread (plain async), same-process-different-thread (Worker
//   Threads, file 06), and different-process (this file). Each step buys more
//   isolation and costs more to cross. Confusing "child process" with "worker
//   thread" — a very common slip — signals you haven't drawn that spectrum.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A DIFFERENT PROCESS, POSSIBLY A DIFFERENT PROGRAM.
//
// Runtime rule:
//   spawn/exec/execFile/fork all call down to the OS's own process-creation
//   syscall (fork+exec on POSIX, CreateProcess on Windows) — the SAME
//   primitive your shell uses to run any command. Node does not do anything
//   special here; it wraps what the OS already does, and hands you streams
//   instead of a terminal.
//
// Practical rule:
//   spawn() streams output and takes an ARGUMENT ARRAY — no shell involved,
//   so no shell-injection risk. exec() runs the WHOLE STRING through a shell
//   and buffers all output in memory — convenient, dangerous with untrusted
//   input, and it caps at maxBuffer. execFile() is spawn's safety with exec's
//   convenience for a single command. fork() is spawn specialized for
//   another NODE script, and it alone gets a built-in IPC channel.
//
// Common trap:
//   Building a shell command with string interpolation
//   (`exec(\`ls ${userInput}\`)`) — this is the same bug class as SQL
//   injection, just for a shell. §4 makes it happen on purpose.
//
// The mental picture — the isolation spectrum, extending file 06's diagram:
//
//   plain async     Worker Thread          child_process (spawn/exec/fork)
//   (same thread)   (file 06)              (this file)
//   ─────────────   ──────────────         ────────────────────────────────
//   shares          shares process,        shares NOTHING but stdio/an
//   everything      thread pool, env       optional IPC pipe and exit
//                                          status
//   cheapest        new isolate + loop     new OS PROCESS: new PID, own
//                   (§4 of file 06)        memory space, own everything
//                                          (§4 here measures the extra cost)
//   a crash there   crash isolated to      crash isolated to the WHOLE
//   is your crash   that worker (06 §7)    process — cannot even corrupt
//                                          your memory by mistake


// ══════════════════════════════════════════════════════════════════
// § 3 — spawn(): STREAMS, ARGUMENT ARRAYS, NO SHELL
// ══════════════════════════════════════════════════════════════════

function section3() {
  return new Promise(resolve => {
    console.log("§3 — the default choice: spawn(), streamed, no shell:\n");

    const t0 = Date.now();
    const child = spawn(process.execPath, ["-e", "console.log('hello from a real child process')"]);

    let out = "";
    child.stdout.on("data", chunk => { out += chunk; });   // ← a real Readable stream
    child.on("exit", (code, signal) => {
      const ms = Date.now() - t0;
      console.log("      command      :", process.execPath, "-e \"console.log(...)\"");
      console.log("      stdout       :", JSON.stringify(out.trim()));
      console.log("      exit code    :", code, "  signal:", signal);
      console.log("      elapsed      :", ms, "ms  ← a full second process, started and exited");
      console.log("\n      spawn() gave the command as an ARRAY: [\"-e\", \"...\"]. Nothing here");
      console.log("      passed through a shell, so nothing in that string could break out");
      console.log("      into a second command — even if it contained `;` or `&&`. §4.\n");

      results.spawnOut = out.trim();
      results.spawnCode = code;
      results.spawnMs = ms;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — COMMAND INJECTION: exec() VS execFile(), PROVED LIVE
// ══════════════════════════════════════════════════════════════════

function section4() {
  return new Promise(resolve => {
    console.log("§4 — the exact bug, made to happen on purpose, then made impossible:\n");

    // A believable "user input" that looks like a filename but is actually a
    // second shell command riding along. This is the whole attack.
    const markerPath = path.join(os.tmpdir(), "injection-proof-" + process.pid + ".txt");
    const userInput = `innocent.txt; node -e "require('fs').writeFileSync('${markerPath}','pwned')"`;

    // 🐛 exec() hands the WHOLE interpolated string to /bin/sh -c "...".
    // The shell sees a `;` and happily runs a second command.
    exec(`echo Looking up ${userInput}`, (err, stdout) => {
      const injectionSucceeded = fs.existsSync(markerPath);

      console.log("      exec(`echo Looking up ${userInput}`):");
      console.log("        stdout          :", JSON.stringify(stdout.trim().split("\n")[0]) + " …(truncated)");
      console.log("        marker file exists:", injectionSucceeded,
        injectionSucceeded ? "🐛 the ';' broke out and ran a SECOND command" : "");

      if (injectionSucceeded) fs.unlinkSync(markerPath);

      // ✅ execFile() with an ARGUMENT ARRAY: the whole userInput string is
      // ONE argument to `echo`, never interpreted by a shell at all.
      execFile("echo", ["Looking up", userInput], (err2, stdout2) => {
        const injectionBlocked = !fs.existsSync(markerPath);

        console.log("\n      execFile(\"echo\", [\"Looking up\", userInput]):");
        console.log("        stdout          :", JSON.stringify(stdout2.trim()));
        console.log("        marker file exists:", fs.existsSync(markerPath),
          injectionBlocked ? "✅ the whole string stayed ONE argument — nothing ran" : "🐛");

        console.log("\n      Same untrusted string, two APIs, two outcomes. The rule that");
        console.log("      actually matters: NEVER build a shell string from untrusted");
        console.log("      input. If you must, spawn/execFile with an argument array, or");
        console.log("      shell-escape every single value — and prefer the array.\n");

        results.injectionSucceeded = injectionSucceeded;
        results.injectionBlocked = injectionBlocked;
        resolve();
      });
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 5 — fork(): AN IPC CHANNEL, AND A SILENT SERIALIZATION BUG
// ══════════════════════════════════════════════════════════════════

function section5() {
  return new Promise(resolve => {
    console.log("§5 — fork() is spawn() for Node scripts, plus a message channel:\n");

    // fork() only makes sense for launching ANOTHER NODE PROCESS: it inherits
    // execPath, gets stdout/stderr/stdin like spawn, and additionally opens
    // an IPC pipe so parent.send()/child.send() and 'message' events work —
    // something spawn/exec/execFile do not give you at all.
    const childSrc = `
      process.on("message", (msg) => {
        process.send({
          echoIsBuffer: Buffer.isBuffer(msg.buf),
          pid: process.pid,
        });
      });
    `;
    const tmp = path.join(os.tmpdir(), "fork-demo-" + process.pid + ".js");
    fs.writeFileSync(tmp, childSrc);

    // Default serialization ("json"): built on JSON.stringify/parse under the
    // hood, so anything JSON can't represent natively — Buffer, Map, Date
    // internals, etc. — arrives reshaped, not reconstructed.
    const jsonChild = fork(tmp, { serialization: "json" });
    jsonChild.on("message", jsonMsg => {
      jsonChild.kill();

      // "advanced" serialization: the SAME structured-clone-family algorithm
      // Worker Threads use (06 §4), so a Buffer survives the trip intact.
      const advChild = fork(tmp, { serialization: "advanced" });
      advChild.on("message", advMsg => {
        advChild.kill();
        fs.unlinkSync(tmp);

        console.log("      the SAME message, `{ buf: Buffer.from(\"hi\") }`, sent two ways:");
        console.log("        serialization: 'json'     → Buffer.isBuffer() in the child:", jsonMsg.echoIsBuffer,
          jsonMsg.echoIsBuffer ? "" : "🐛 arrived as a plain {type,data} object instead");
        console.log("        serialization: 'advanced' → Buffer.isBuffer() in the child:", advMsg.echoIsBuffer,
          advMsg.echoIsBuffer ? "✅ arrived as a real Buffer" : "");
        console.log("\n      parent pid:", process.pid, " child pid:", jsonMsg.pid,
          "  (different process:", process.pid !== jsonMsg.pid, ")");
        console.log("\n      'json' has been the DEFAULT the whole time. Anyone who sends a");
        console.log("      Buffer, a Map, or a Date across fork() IPC without setting");
        console.log("      serialization: 'advanced' gets this silently — no error, no");
        console.log("      warning, just a differently-shaped object on the other side.");
        console.log("      Worker Threads never had this problem: structured clone was");
        console.log("      always the only option (06 §4). fork()'s IPC predates it and");
        console.log("      kept the old default for backward compatibility.\n");

        results.jsonIsBuffer = jsonMsg.echoIsBuffer;
        results.advIsBuffer = advMsg.echoIsBuffer;
        results.childPid = jsonMsg.pid;
        results.parentPid = process.pid;
        resolve();
      });
      advChild.send({ buf: Buffer.from("hi") });
    });
    jsonChild.send({ buf: Buffer.from("hi") });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE REAL COST: fork() VS A WORKER THREAD
// ══════════════════════════════════════════════════════════════════

function section6() {
  return new Promise(resolve => {
    console.log("§6 — same job, 'say hello', two isolation levels, two prices:\n");

    const { Worker } = require("worker_threads");
    const tmp = path.join(os.tmpdir(), "fork-cost-" + process.pid + ".js");
    fs.writeFileSync(tmp, "process.send({ ready: true });");

    const t0 = Date.now();
    const child = fork(tmp, { stdio: "ignore" });
    child.on("message", () => {
      const forkMs = Date.now() - t0;
      child.kill();
      fs.unlinkSync(tmp);

      const t1 = Date.now();
      const w = new Worker(
        "const { parentPort } = require('worker_threads'); parentPort.postMessage({ ready: true });",
        { eval: true }
      );
      w.on("message", () => {
        const workerMs = Date.now() - t1;
        w.terminate();

        console.log("      time to first message:");
        console.log("        fork()        :", forkMs, "ms  ← a whole new V8 process: new heap,");
        console.log("                                          new GC, re-parsed bootstrap code");
        console.log("        Worker Thread :", workerMs, "ms  ← a new isolate inside the SAME process");
        console.log("        ratio         :", (forkMs / Math.max(workerMs, 1)).toFixed(1) + "×",
          forkMs > workerMs ? "slower to stand up 🐛" : "");
        console.log("\n      Both scale to the number of CPU cores you actually have; neither");
        console.log("      is 'faster' at steady-state work. The gap here is pure startup");
        console.log("      and per-message overhead — worth it when you need the process");
        console.log("      boundary (§7), wasted when you only needed the thread boundary.\n");

        results.forkMs = forkMs;
        results.workerMs = workerMs;
        resolve();
      });
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 7 — CRASH ISOLATION, AND THE SYNC-SPAWN TRAP
// ══════════════════════════════════════════════════════════════════

function section7() {
  return new Promise(resolve => {
    console.log("§7 — a child crashing is even further from you than a worker crashing:\n");

    const child = spawn(process.execPath, ["-e", "process.exit(7)"]);
    child.on("exit", (code, signal) => {
      console.log("      child exit code:", code, " signal:", signal);
      console.log("      parent executing this line: true ✅ — completely unaffected");
      console.log("      (this is stronger isolation than 06 §7's worker: there is no");
      console.log("       shared process, shared heap or shared anything left to corrupt)");

      // The trap: spawnSync blocks the CALLING thread until the child exits —
      // same disease as 02 §8's fs.readFileSync, applied to a whole process.
      let ticks = 0;
      const iv = setInterval(() => ticks++, 1);
      const t0 = Date.now();
      spawnSync("sleep", ["0.25"]);
      const blockedMs = Date.now() - t0;
      clearInterval(iv);

      console.log("\n      spawnSync(\"sleep\", [\"0.25\"]) — a QUARTER SECOND of another");
      console.log("      program running, on the main thread:");
      console.log("        wall time                 :", blockedMs, "ms");
      console.log("        1 ms timer ticks during it:", ticks, "← the loop never ran 🐛");
      console.log("        (identical mechanism to 02 §8's fs.readFileSync — sync APIs");
      console.log("         never reach libuv, no matter how much OS-level work they wrap)");
      console.log("\n      spawn()/fork()/exec() are async and never do this. spawnSync/");
      console.log("      execSync/execFileSync exist for scripts and CLIs where blocking");
      console.log("      is the point — never reach for them in a server request path.\n");

      results.childExitCode = code;
      results.blockedMs = blockedMs;
      results.ticksDuringSpawnSync = ticks;
      resolve();
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE FOUR APIS, SIDE BY SIDE
// ══════════════════════════════════════════════════════════════════
//
//              shell?   buffers      streams    IPC       best for
//              involved output?      output?    channel?
//   spawn      no       no           yes        no        long-running, large
//                                                          or streaming output
//   exec       YES      yes (capped  no         no        a short trusted shell
//                        by maxBuffer)                     command with pipes
//   execFile   no       yes          no*        no        one program, one-shot,
//                                                          untrusted arguments
//   fork       no       no           yes        YES       another Node script
//                                                          you want to talk to
//
//   * execFile CAN stream (it returns the same ChildProcess as spawn); the
//     table lists its common *callback-style* usage, which buffers.
//
// The single sentence that answers "which one should I use": if a shell
// feature (pipes, globs, `&&`) is genuinely needed, use exec() with a fully
// trusted, non-interpolated command string; otherwise default to spawn() or
// execFile(), and reach for fork() only when the child is Node and you need
// message passing.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Remote code execution via exec() and a form field:
//   String interpolation into a shell command. The textbook injection. → §4.
//
// Bug 2 — "Error: stdout maxBuffer length exceeded":
//   exec() buffers the whole output in memory with a default 1 MB cap.
//   Switch to spawn() and stream it, or raise maxBuffer deliberately.
//
// Bug 3 — A Buffer sent over fork() IPC that silently isn't one anymore:
//   Default 'json' serialization. → §5.
//
// Bug 4 — A CLI wrapper that "hangs" the whole server for its runtime:
//   execSync/spawnSync in a request handler. → §7, and 02 §8's fs pattern
//   repeating at the process level.
//
// Bug 5 — Zombie / runaway child processes after the parent restarts:
//   A spawned child was never .kill()'d and the parent didn't manage its
//   lifecycle (or used `detached: true` without meaning to). Track every
//   PID you spawn.
//
// Bug 6 — A worker-shaped problem solved with fork() and paying 2-3× the
//   startup cost for no isolation benefit actually needed: → §6, and file 06.
//
// Bug 7 — execFile() called with a shell metacharacter EXPECTING it to work
//   (like `*` for a glob): it won't — no shell means no glob expansion
//   either. That safety is also a capability loss; know which you need.
//
// Bug 8 — Assuming child.send() exists on every ChildProcess:
//   Only fork() sets up the IPC channel. spawn()/exec()/execFile() have no
//   .send() and no 'message' event.
//
// Bug 9 — Reading a large file's worth of stdout from exec() into a string,
//   then parsing it, when spawn() + a streaming JSON parser would have kept
//   memory flat. → group 2, the streams files.
//
// Bug 10 — Trusting a child process's exit code 0 without checking `signal`:
//   a process killed by SIGKILL/SIGTERM reports code === null and the signal
//   name instead — treating null as success is a real bug. → §7.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

function assertions() {
  // spawn:
  assert(results.spawnOut === "hello from a real child process",
    "spawn() streamed real stdout from a genuinely separate process");
  assert(results.spawnCode === 0, "…which exited cleanly");

  // Injection:
  assert(results.injectionSucceeded === true,
    "exec() with string interpolation let a ';' break out into a SECOND command 🐛");
  assert(results.injectionBlocked === true,
    "the identical untrusted string via execFile()'s argument array stayed inert ✅");

  // fork() serialization:
  assert(results.jsonIsBuffer === false,
    "fork()'s DEFAULT ('json') serialization silently turns a Buffer into a plain object 🐛");
  assert(results.advIsBuffer === true,
    "'advanced' serialization — the same family Worker Threads always use — preserves it ✅");
  assert(results.childPid !== results.parentPid,
    "fork() really is a different OS process, with its own PID");

  // Cost:
  assert(results.forkMs > 0 && results.workerMs > 0, "both variants were genuinely timed");
  assert(results.forkMs >= results.workerMs,
    "standing up a full Node process cost at least as much as a Worker Thread — usually much more 🐛");

  // Crash isolation and the sync trap:
  assert(results.childExitCode === 7,
    "the child's own exit code reached the parent untouched, and the parent kept running");
  assert(results.blockedMs >= 240, "spawnSync really did block for the full ~250 ms");
  assert(results.ticksDuringSpawnSync === 0,
    "…and let ZERO 1 ms timers fire while blocked — sync process spawning never reaches libuv 🐛");

  console.log("§10 — mini assertions passed for: Child Process");
  console.log("\n  The pair that captures it: the exact same untrusted string ran a SECOND");
  console.log("  shell command through exec() and did nothing through execFile(), and the");
  console.log("  exact same Buffer arrived intact under 'advanced' fork() serialization");
  console.log("  and as a plain object under the DEFAULT 'json' one — two silent traps,");
  console.log("  both fixed by picking the right one of four near-identical-looking APIs.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is child_process and how does it differ from Worker
// Threads?", answer:
//
//   "child_process launches a genuinely separate operating-system process —
//    its own PID, its own memory space, and it doesn't even have to be
//    JavaScript. That's a step further than a Worker Thread, which still
//    shares the process; a child process shares nothing except whatever
//    streams or IPC channel you set up between them.
//
//    There are four ways to spawn one, and the choice matters for security,
//    not just style. spawn() takes an argument array and never touches a
//    shell, so it's safe with untrusted input. exec() runs a whole string
//    through /bin/sh, which is convenient for pipes and globbing but means
//    string-interpolating untrusted input is a command injection — I've
//    proven that directly: the same ';'-laden string ran a second command
//    under exec() and did nothing at all under execFile()'s array form.
//    execFile() is spawn's safety for a single external program. fork() is
//    spawn specialized for launching another Node script, and it's the only
//    one of the four that opens an IPC channel automatically.
//
//    fork()'s IPC has a footgun worth knowing: its DEFAULT serialization is
//    JSON-based, so a Buffer you send arrives as a plain {type, data} object,
//    not a real Buffer — silently, no error. Setting serialization:
//    'advanced' switches to the same structured-clone family Worker Threads
//    always use, and the Buffer survives intact.
//
//    Cost-wise, I've measured fork() taking noticeably longer than a Worker
//    Thread to reach its first message — it's standing up an entire new V8
//    process, not just a new isolate inside the existing one. So the real
//    decision rule is: reach for a Worker Thread when the work is your own
//    CPU-bound JavaScript and you just need parallelism; reach for
//    child_process when you need to run something that ISN'T your JS — a CLI
//    tool, another language, another Node script you want a hard crash
//    boundary around — or when you specifically want isolation strong enough
//    that a child crashing can't touch your process's memory at all, which is
//    a stronger guarantee than a worker gives you."
//
// Leading with "process vs thread" and proving both the injection bug and
// the serialization bug live is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What's the core difference between child_process and Worker Threads?
// A1. A different OS process entirely — own memory, own PID — versus a
//     second thread inside the same process. → file 06.
//
// Q2. Which spawning API is safe with untrusted input, and why?
// A2. spawn() or execFile(), because both take an argument array and never
//     invoke a shell. exec() interpolates into a shell string.
//
// Q3. What's the command-injection mechanism, concretely?
// A3. exec() hands the string to `sh -c "..."`; shell metacharacters like `;`
//     or `&&` in the untrusted portion start a second command.
//
// Q4. Which of the four gives you an IPC channel?
// A4. Only fork() — .send()/.on('message') exist there and nowhere else.
//
// Q5. What breaks if you send a Buffer over fork()'s default IPC?
// A5. It silently becomes a plain {type: 'Buffer', data: [...]} object —
//     Buffer.isBuffer() on the receiving end is false. Fix: serialization:
//     'advanced'.
//
// Q6. Is fork() cheaper or more expensive than a Worker Thread to start?
// A6. More expensive — it starts a whole new Node process (new V8, re-run
//     bootstrap), not just a new isolate in the existing one.
//
// Q7. Does exec() stream output?
// A7. No — it buffers everything and hands it to the callback once, capped
//     by maxBuffer (default 1 MB). spawn() streams.
//
// Q8. What does a child's exit code of null mean?
// A8. It wasn't a normal exit — check the `signal` argument; the process was
//     killed by a signal instead.
//
// Q9. What's wrong with spawnSync in a request handler?
// A9. It blocks the whole event loop for the child's entire runtime — same
//     failure mode as a sync fs call, applied to an entire external process.
//
// Q10. Can execFile() run shell built-ins or use globs?
// A10. No — no shell is involved, so no globbing, no `&&`, no pipes. That's
//      the same fact that makes it safe.
//
// Q11. How would you run untrusted input through a shell feature you
//      genuinely need, like a pipe?
// A11. Don't build one shell string — spawn each stage as its own process
//      and pipe the streams together in Node (child1.stdout.pipe(child2.stdin)),
//      or validate/allowlist the untrusted piece strictly before ever
//      touching exec().
//
// Q12. Worker Thread crash vs child process crash — which is more isolated?
// A12. The child process, structurally. A worker still shares the process; a
//      crashed child can't corrupt shared process state because there was
//      none to begin with.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a child process, structurally?
//   Back : A separate OS process — own PID, own memory. Not a thread.
//
// Flashcard 2:
//   Front: Which spawning APIs never touch a shell?
//   Back : spawn() and execFile() — argument arrays, no shell.
//
// Flashcard 3:
//   Front: Which one is the command-injection risk?
//   Back : exec() — it runs a full string through `sh -c`.
//
// Flashcard 4:
//   Front: Which one gets IPC (send/message)?
//   Back : fork() only, and only for launching another Node script.
//
// Flashcard 5:
//   Front: fork()'s default IPC footgun?
//   Back : 'json' serialization turns a Buffer into a plain object. Use
//          serialization: 'advanced' to preserve it.
//
// Flashcard 6:
//   Front: fork() vs Worker Thread startup cost?
//   Back : fork() is slower — a whole new V8 process, not just a new isolate.
//
// Flashcard 7:
//   Front: What does spawnSync do to the event loop?
//   Back : Blocks it entirely for the child's whole runtime — same disease as
//          a sync fs call.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "The isolation is stronger than a worker's because there's no
//          shared process left to corrupt — and that strength is the reason
//          it costs more to start."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take §4's exec() call and make the injection write something more
//   visible (append to a log file) instead of just a marker. Confirm it, then
//   delete it.
//
// Task 2:
//   Rewrite §4's exec() call as a safely-templated version using execFile()
//   with the SAME user-facing behaviour, minus the vulnerability.
//
// Task 3:
//   Send a Map or a Date through fork()'s default IPC and inspect what
//   arrives on the other side. Compare with 'advanced'.
//
// Task 4:
//   Time fork() vs Worker Thread startup 20 times each and compare medians,
//   not single samples.
//
// Task 5:
//   Spawn a child with `detached: true` and `child.unref()`. Confirm the
//   PARENT can exit while the child keeps running — then go find and kill it
//   manually.
//
// Task 6:
//   Trigger exec()'s maxBuffer error on purpose with a command that produces
//   a lot of output, and fix it by switching to spawn() + streaming.
//
// Task 7:
//   Build a two-stage pipeline (`grep` piped into `wc -l`) using two spawn()
//   calls and `.pipe()`, without ever building a shell string.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A child process shares nothing — not the isolate, not the heap, not the
//   process. That is stronger isolation than a Worker Thread and it costs
//   more to set up, every time.
//
// If you remember the common bug:
//   String-interpolating untrusted input into exec(). It is command
//   injection, and execFile() with an argument array is the fix.
//
// If you remember the professional framing:
//   spawn/execFile for anything untrusted, exec only for trusted shell
//   features, fork only when the child is Node and you need messages — and
//   never the Sync variants anywhere near a request path.
//
// NEXT TOPIC -> 08_cluster-module.js


(async function main() {
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  assertions();
})();
