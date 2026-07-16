// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  15_useinsertioneffect.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useInsertionEffect
//
// WHAT YOU WILL MASTER HERE:
//   1. The third effect timing, and why a third one was needed
//   2. The problem: CSS-in-JS + useLayoutEffect = layout thrashing
//   3. The complete effect ordering table — the payoff of this whole section
//   4. Why you will (almost certainly) never write this hook
//   5. How to answer honestly about a hook you have not used
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/15_useinsertioneffect.js"
//
// Prerequisite: 09_uselayouteffect-vs-useeffect.js. This file adds the third
// timing and completes the picture.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useInsertionEffect:
// Runs BEFORE React touches the DOM, so CSS-in-JS libraries can inject
// <style> tags before any layout effect tries to measure something.
//
// If interviewer says "explain it simply", say:
// "It is a third effect timing that fires even earlier than useLayoutEffect —
//  before the DOM mutations. It exists for exactly one audience: CSS-in-JS
//  library authors."
//
// If interviewer asks "why does it matter?", say:
// "Because if a styled-component injects its <style> tag in a layout effect,
//  every OTHER layout effect that measures the DOM either measures unstyled
//  elements or forces the browser to recalculate layout. React added a
//  timing slot early enough that styles are in place before anyone measures."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   styles first, then DOM, then measure, then paint
//
// The full commit sequence — memorize THIS, not the hook:
//
//   1. RENDER          your component functions run (no DOM)
//        ↓
//   2. useInsertionEffect  ← styles injected. NO DOM refs yet.
//        ↓
//   3. MUTATION        React applies DOM changes
//        ↓
//   4. refs attached
//        ↓
//   5. useLayoutEffect ← measure and mutate. Refs available. Blocking.
//        ↓
//   6. 🎨 PAINT
//        ↓
//   7. useEffect       ← everything else. After paint.
//
// Runtime rule:
//   In useInsertionEffect, refs are NOT attached and state updates are NOT
//   allowed — React is mid-commit and the tree is not ready.
//
// Practical rule:
//   If you are not writing styled-components, Emotion, or your own CSS-in-JS
//   runtime, you will never type this hook. That is not a dodge — it is the
//   correct answer.
//
// Common trap:
//   Trying to use it "because it runs earliest". You cannot read refs and you
//   cannot setState. It is a strictly worse useLayoutEffect for every purpose
//   except injecting styles.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHY A THIRD TIMING WAS NEEDED
// ══════════════════════════════════════════════════════════════════
//
// The concrete problem, before this hook existed:
//
//   A styled-component must inject its CSS somewhere. The only pre-paint slot
//   was useLayoutEffect. So:
//
//     ComponentA (styled) → useLayoutEffect → inject <style>
//     ComponentB          → useLayoutEffect → measure a node
//
//   React runs layout effects in tree order. If B runs before A, B measures
//   an element whose styles have not been injected yet — it gets the WRONG
//   size. If A runs first, B measures correctly but A's injection has already
//   invalidated layout, so B's read forces a synchronous recalculation.
//
//   Either way you lose: wrong measurements, or layout thrashing.
//
// The fix is not cleverness — it is a new phase that runs before ALL layout
// effects, guaranteeing styles are in the document before anyone measures.

console.log("§3 — the problem, with the two effect timings React used to have:\n");

function simulateCommit({ hasInsertionPhase }) {
  const document = { styles: [], layoutRecalcs: 0 };
  const log = [];

  const injectStyle = (name) => {
    document.styles.push(name);
    document.layoutRecalcs++;                  // injecting CSS invalidates layout
    log.push(`inject <style> for ${name} — layout invalidated`);
  };

  const measure = (name) => {
    const stylesReady = document.styles.length > 0;
    log.push(`measure ${name} → styles present: ${stylesReady}` +
      (stylesReady ? " ✅" : " 🐛 measuring an UNSTYLED element"));
    return stylesReady;
  };

  if (hasInsertionPhase) {
    // useInsertionEffect — before everything
    injectStyle("Button");
    log.push("── mutation: React updates the DOM");
    log.push("── refs attached");
    // useLayoutEffect
    measure("Tooltip");
    return { log, ...document, correct: true };
  }

  // The old world: both in useLayoutEffect, tree order decides.
  log.push("── mutation: React updates the DOM");
  log.push("── refs attached");
  const correct = measure("Tooltip");          // Tooltip is EARLIER in the tree
  injectStyle("Button");                       // ...so it measures first. Wrong.
  return { log, ...document, correct };
}

const oldWay = simulateCommit({ hasInsertionPhase: false });
const newWay = simulateCommit({ hasInsertionPhase: true });

console.log("  BEFORE — CSS-in-JS injecting from useLayoutEffect:");
for (const line of oldWay.log) console.log("    " + line);
console.log("    → the Tooltip measured an unstyled Button. Wrong size.\n");

console.log("  AFTER — CSS-in-JS injecting from useInsertionEffect:");
for (const line of newWay.log) console.log("    " + line);
console.log("    → styles were already in the document. Correct measurement.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE COMPLETE ORDERING (the real payoff)
// ══════════════════════════════════════════════════════════════════
//
// This table is worth more than the hook itself. It is the answer to half a
// dozen interview questions.

console.log("§4 — the complete commit sequence:\n");

function fullCommit() {
  const timeline = [];
  const state = { stylesInjected: false, domUpdated: false, refsAttached: false, painted: false };

  timeline.push({ phase: "render", ...state, note: "your component function runs" });

  state.stylesInjected = true;
  timeline.push({ phase: "useInsertionEffect", ...state, note: "CSS-in-JS injects here. NO refs, NO setState." });

  state.domUpdated = true;
  timeline.push({ phase: "mutation", ...state, note: "React applies DOM changes" });

  state.refsAttached = true;
  timeline.push({ phase: "refs attached", ...state, note: "ref.current is now the node" });

  timeline.push({ phase: "useLayoutEffect", ...state, note: "measure + mutate. Blocking." });

  state.painted = true;
  timeline.push({ phase: "🎨 PAINT", ...state, note: "the user finally sees it" });

  timeline.push({ phase: "useEffect", ...state, note: "everything else. Non-blocking." });

  return timeline;
}

console.log("  phase              | styles | dom | refs | painted | what happens here");
console.log("  -------------------|--------|-----|------|---------|------------------");
for (const t of fullCommit()) {
  console.log(`  ${t.phase.padEnd(18)} | ${String(t.stylesInjected).padEnd(6)} | ` +
    `${String(t.domUpdated).padEnd(3)} | ${String(t.refsAttached).padEnd(4)} | ` +
    `${String(t.painted).padEnd(7)} | ${t.note}`);
}

console.log("\n  Read the refs column. That is why useInsertionEffect is useless");
console.log("  for anything but styles: refs are not attached yet, so there is");
console.log("  nothing to measure and nothing to mutate.");
console.log("\n  And the three hooks map cleanly onto three questions:");
console.log("    useInsertionEffect → 'I must run before the DOM exists'   (styles)");
console.log("    useLayoutEffect    → 'I must run before the user SEES it' (measure)");
console.log("    useEffect          → 'I just need to run'                 (everything)\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE RESTRICTIONS
// ══════════════════════════════════════════════════════════════════
//
// React documents these explicitly, and they are what make the hook useless
// for general work:
//
//   ❌ You cannot update state. React is mid-commit; the tree is not ready.
//   ❌ Refs are not attached yet. ref.current is still null.
//   ❌ It does not run on the server. There is no DOM to insert into.
//   ❌ You cannot access the DOM you just rendered — it does not exist yet.
//
// What you CAN do: insert <style> tags, and clean them up.
//
// Note the shape of the list: every restriction removes a reason you might
// have wanted it. That is deliberate. React built the narrowest possible
// escape hatch, on purpose, for one library ecosystem.

console.log("§5 — what you can and cannot do:\n");

const insertionEffectCapabilities = {
  "inject a <style> tag": true,
  "read ref.current": false,
  "call setState": false,
  "measure the DOM": false,
  "run on the server": false,
};

for (const [action, allowed] of Object.entries(insertionEffectCapabilities)) {
  console.log(`    ${action.padEnd(22)} ${allowed ? "✅" : "❌"}`);
}
console.log("\n  One yes, four nos. The hook does exactly one job.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHAT IT LOOKS LIKE IN REAL LIFE
// ══════════════════════════════════════════════════════════════════
//
// The only realistic usage — roughly what Emotion and styled-components do:
//
//   let injected = new Set();
//
//   function useCSS(rule) {
//     useInsertionEffect(() => {
//       if (injected.has(rule)) return;        // dedupe across instances
//       injected.add(rule);
//       const style = document.createElement("style");
//       style.textContent = rule;
//       document.head.appendChild(style);
//       return () => {
//         injected.delete(rule);
//         style.remove();                       // cleanup, like any effect
//       };
//     }, [rule]);
//     return getClassName(rule);
//   }
//
//   function Button() {
//     const className = useCSS(`.btn-a1b2 { color: red; }`);
//     return <button className={className}>Click</button>;
//   }
//
// Note the dedupe: a hundred <Button /> instances share one rule, so the set
// prevents a hundred <style> tags. That bookkeeping is exactly the kind of
// thing library authors deal with and app authors should not.
//
// And note it still has a cleanup and a deps array — it is a normal effect
// in every way except its timing slot.

console.log("§6 — the deduped style injection pattern:\n");

const head = { styles: [] };
const injected = new Set();

function useCSS(rule) {
  if (injected.has(rule)) return "cached";
  injected.add(rule);
  head.styles.push(rule);
  return "injected";
}

const results = [
  useCSS(".btn { color: red }"),
  useCSS(".btn { color: red }"),     // a second <Button /> — same rule
  useCSS(".btn { color: red }"),     // a third
  useCSS(".card { padding: 8px }"),  // a different component
];

console.log("    3 <Button/> + 1 <Card/> →", JSON.stringify(results));
console.log("    <style> tags in <head>:", head.styles.length,
  "← not 4. The dedupe is the library's job.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — HOW TO ANSWER HONESTLY
// ══════════════════════════════════════════════════════════════════
//
// This hook is a trap in interviews, but not the way people think. The trap
// is pretending you use it.
//
// If you say "yes, I use useInsertionEffect for X", the follow-up — "why not
// useLayoutEffect?" — will expose you immediately, because there is no X.
//
// The strong answer:
//
//   "I have never written it, and I would push back on any PR that did unless
//    we were building a CSS-in-JS runtime. It exists because styled-components
//    and Emotion had to inject <style> tags from useLayoutEffect, which meant
//    other components' layout effects were either measuring unstyled elements
//    or triggering layout recalculation. React gave them a phase before the
//    DOM mutations so styles land before anyone measures.
//
//    What I DO use is the ordering it completes: insertion → mutation → refs →
//    layout → paint → passive. That sequence explains why refs are null in
//    render, why useLayoutEffect can measure, and why useEffect flickers when
//    it shouldn't."
//
// That answer is better than a fabricated use case, because it demonstrates
// you understand the commit phase — which is what the question is really
// probing. Interviewers ask about obscure hooks to see whether you will
// bluff.


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   a log line                commitInsertionEffects runs before
//                             commitMutationEffects in the commit phase
//   no enforcement            React genuinely warns if you setState inside it
//   n/a                       added in React 18, alongside the concurrent
//                             features that made the timing matter more
//   n/a                       does not run during SSR at all
//   n/a                       the cleanup runs before the next insertion
//                             effect, like any other effect
//
// The honest ecosystem note:
//   The irony is that by the time useInsertionEffect shipped, the industry
//   was already moving AWAY from runtime CSS-in-JS. Tailwind, CSS Modules,
//   vanilla-extract, and zero-runtime libraries like Linaria compile styles at
//   BUILD time — no injection, no timing problem, no hook. And runtime
//   CSS-in-JS has a known incompatibility with React Server Components,
//   because it needs to run in the browser.
//
//   So this hook solves a real problem for a shrinking set of libraries. That
//   is a genuinely interesting thing to say in an interview: it shows you
//   track where the ecosystem is going, not just what the docs say.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Warning: useInsertionEffect must not schedule updates":
//   You called setState in it. React is mid-commit.
//
// Bug 2 — ref.current is null:
//   Refs attach AFTER this phase. Use useLayoutEffect.
//
// Bug 3 — Styles missing on the server:
//   It does not run during SSR. CSS-in-JS libraries need a separate
//   server-side collection step — which is exactly why they are painful
//   with SSR and RSC.
//
// Bug 4 — Using it because "earlier is better":
//   You lose refs and setState and gain nothing. → §5.
//
// Bug 5 — A <style> tag per component instance:
//   No dedupe. A hundred buttons, a hundred style tags. → §6.
//
// Bug 6 — Layout thrash from injecting in useLayoutEffect:
//   The original bug. → §3. If you write CSS-in-JS by hand, this is yours.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The problem it solves:
assert(oldWay.correct === false,
  "layout-effect injection: the Tooltip measured an UNSTYLED element 🐛");
assert(newWay.correct === true,
  "insertion-effect injection: styles were in the document before any measure ✅");
assert(newWay.styles.length === 1 && oldWay.styles.length === 1,
  "both injected the same style — only the TIMING differed");

// The ordering — the real payoff:
const timeline = fullCommit();
const phase = (name) => timeline.findIndex(t => t.phase === name);
assert(phase("useInsertionEffect") < phase("mutation"),
  "insertion effects run BEFORE React touches the DOM");
assert(phase("mutation") < phase("refs attached"),
  "refs attach after the DOM is updated");
assert(phase("refs attached") < phase("useLayoutEffect"),
  "...which is why useLayoutEffect can measure");
assert(phase("useLayoutEffect") < phase("🎨 PAINT"),
  "layout effects run before paint");
assert(phase("🎨 PAINT") < phase("useEffect"),
  "passive effects run after paint");

// The restrictions are what make it narrow:
assert(timeline[phase("useInsertionEffect")].refsAttached === false,
  "no refs during the insertion phase — nothing to measure");
assert(timeline[phase("useLayoutEffect")].refsAttached === true,
  "refs ARE available in useLayoutEffect — that is the difference");
assert(Object.values(insertionEffectCapabilities).filter(Boolean).length === 1,
  "exactly ONE thing this hook can do: inject styles");

// The dedupe:
assert(head.styles.length === 2,
  "3 Buttons + 1 Card → 2 style tags, not 4. The library dedupes.");

console.log("§10 — mini assertions passed for: useInsertionEffect");
console.log("\n  The assertions worth keeping: the full ordering. That table is");
console.log("  the answer to half this section's interview questions.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useInsertionEffect?", answer like this:
//
//   "It's a third effect timing that runs before React mutates the DOM —
//    earlier than useLayoutEffect. It exists for exactly one audience:
//    CSS-in-JS library authors.
//
//    The problem it solves: styled-components and Emotion had to inject their
//    <style> tags from useLayoutEffect, because that was the only pre-paint
//    slot. But React runs layout effects in tree order, so another component's
//    layout effect might measure a node before its styles were injected — it
//    gets the wrong size. And if the injection ran first, the measurement
//    forced a layout recalculation. Wrong measurements or layout thrashing,
//    take your pick. So React added a phase before all mutations, guaranteeing
//    styles are in the document before anyone measures.
//
//    I'd be honest: I've never written it, and I'd question a PR that did
//    unless we were building a CSS-in-JS runtime. The restrictions make it
//    useless for anything else — no refs, no setState, no SSR. It does one job.
//
//    What I actually use is the ordering it completes: insertion → mutation →
//    refs attached → layout effects → paint → passive effects. That sequence
//    explains why refs are null during render, why useLayoutEffect is where you
//    measure, and why useEffect gives you a flicker.
//
//    There's a nice irony too: by the time it shipped, the ecosystem was moving
//    to zero-runtime CSS — Tailwind, CSS Modules, vanilla-extract — which
//    compile at build time and don't have the timing problem at all. Runtime
//    CSS-in-JS also fights React Server Components. So it solves a real problem
//    for a shrinking set of libraries."
//
// Refusing to invent a use case, then pivoting to the ordering, is the
// senior move. The question is testing whether you bluff.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is useInsertionEffect for?
// A1. CSS-in-JS libraries injecting <style> tags before any layout effect
//     measures the DOM.
//
// Q2. Why not useLayoutEffect for that?
// A2. Layout effects run in tree order, so a measurement can happen before
//     the injection — or after it, forcing a layout recalculation.
//
// Q3. What is the full effect ordering?
// A3. insertion → mutation → refs attached → layout → paint → passive.
//
// Q4. What can't you do in it?
// A4. No setState, no refs (not attached yet), no DOM access, no SSR.
//
// Q5. Have you used it?
// A5. No — and neither has almost anyone. It is a library-author hook. Saying
//     otherwise invites a follow-up you cannot answer.
//
// Q6. Why do refs not work there?
// A6. It runs before the mutation phase. The nodes do not exist yet.
//
// Q7. Is it still relevant?
// A7. Less every year. Zero-runtime CSS compiles at build time, and runtime
//     CSS-in-JS conflicts with RSC.
//
// Q8. When did it arrive?
// A8. React 18, with the concurrent features that made effect timing matter
//     more.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useInsertionEffect?
//   Back : A pre-mutation effect for injecting <style> tags. Library authors only.
//
// Flashcard 2:
//   Front: What is the full ordering?
//   Back : insertion → mutation → refs → layout → PAINT → passive.
//
// Flashcard 3:
//   Front: Why can't it read refs?
//   Back : It runs before the DOM mutation. The nodes do not exist yet.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Using it because "earlier is better". You lose refs and setState.
//
// Flashcard 5:
//   Front: Should you use it?
//   Back : No, unless you are writing a CSS-in-JS runtime.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Say you have never used it, explain WHY it exists, then pivot to
//          the ordering.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the full commit ordering from memory. Six phases. This is the
//   single most useful thing in this file.
//
// Task 2:
//   Extend §3: add a THIRD component that also injects. Confirm the insertion
//   phase still guarantees all styles land before any measurement.
//
// Task 3:
//   Add a cleanup to the useCSS pattern and confirm removing the last Button
//   removes the <style> tag — and that removing only one of three does NOT.
//
// Task 4:
//   Try to use it in the mini React from file 09: add an insertion queue that
//   drains before mutation. You now have all three timings in one model.
//
// Task 5:
//   Write the honest interview answer for a hook you have never used. Practise
//   it out loud. The skill transfers to every obscure API question.
//
// Task 6:
//   Explain in 60 seconds why CSS-in-JS needed its own effect timing, to
//   someone who has only ever used Tailwind.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The ordering — insertion → mutation → refs → layout → PAINT → passive.
//   The hook is trivia; the sequence is the knowledge.
//
// If you remember the common bug:
//   Injecting styles from useLayoutEffect makes other components measure
//   unstyled elements, or thrash layout.
//
// If you remember the professional framing:
//   You will never write it. Say so, explain why it exists, and do not invent
//   a use case — that is exactly what the question is testing.
//
// NEXT TOPIC -> index.js, then 03_custom-hooks/01_rules-of-hooks.js
