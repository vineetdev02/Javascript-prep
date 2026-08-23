// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  14_hydration-performance.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Hydration performance
//
// WHAT YOU WILL MASTER HERE:
//   1. What hydration actually does, and why SSR alone is not "faster"
//   2. The uncanny valley: visible but dead, and how to measure it
//   3. Why hydration costs MORE than a client render, not less — PROVEN
//   4. Hydration mismatches: the six causes, and what React does about each
//   5. Selective hydration, and why Suspense boundaries are the unit
//   6. Islands and Server Components: shipping less to hydrate
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/14_hydration-performance.js"
//
// Prerequisites: 13 (this is mostly an LCP/INP story), 04-06 (the bundle is what
// gets hydrated). 15 is the other half — streaming is how hydration became
// incremental.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Hydration:
// The client-side pass where React walks server-rendered HTML, rebuilds its
// internal component tree in memory, and attaches event handlers and state to
// the DOM nodes that already exist — turning static markup into a live app.
//
// If interviewer says "explain it simply", say:
// "The server sends finished HTML, so the user sees the page immediately. But
//  that HTML is dead — no click handlers, no state. Hydration is React running
//  the same components again in the browser to attach all of that to the nodes
//  that are already there, instead of creating them."
//
// If interviewer asks "why does it matter?", say:
// "Because it's the tax on server rendering, and people forget to count it. SSR
//  improves LCP — content paints without waiting for JavaScript. But hydration
//  runs your whole component tree AGAIN in the browser, and until it finishes
//  the page looks ready and doesn't respond. That gap is the 'uncanny valley',
//  and it shows up as terrible INP. So SSR isn't 'faster' — it trades a later
//  paint for an earlier one and adds a cost after it. The modern architectures —
//  streaming, selective hydration, islands, Server Components — all exist to
//  shrink that second half."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   SSR paints early; HYDRATION is the bill
//
// The timeline:
//
//   ── CSR ──────────────────────────────────────────────────────────
//   HTML(empty) → download JS → parse → render → PAINT + interactive
//                                                ↑ both at the same moment
//
//   ── SSR + hydration ──────────────────────────────────────────────
//   HTML(full) → PAINT → download JS → parse → HYDRATE → interactive
//                ↑ early                                  ↑ later than you think
//                └──────── the uncanny valley ────────────┘
//                          visible, but dead
//
// Runtime rule:
//   hydrateRoot does NOT create DOM. It walks the existing DOM alongside a fresh
//   render of your components, matches them up, and attaches. Creating nodes is
//   the part it skips — and node creation was never the expensive part.
//
// Practical rule:
//   Hydration cost scales with the number of COMPONENTS you ship, not with how
//   much HTML the server sent. The fix is always "hydrate less", never "render
//   less HTML".
//
// Common trap:
//   Assuming SSR makes an app faster overall. It moves the first paint earlier
//   and pushes interactivity later. If a page is behind a login and nobody
//   measures LCP on it, SSR may be buying you nothing while costing you INP.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE UNCANNY VALLEY, MEASURED
// ══════════════════════════════════════════════════════════════════

console.log("§3 — visible at 0.8s, usable at 3.4s:\n");

const timeline = {
  ttfb: 320,            // server rendered the HTML
  htmlPainted: 800,     // ← LCP happens around here. The user sees the page.
  jsDownloaded: 2100,   // the bundle arrived
  jsParsed: 2600,       // parsed + compiled — main thread, blocking
  hydrated: 3400,       // ← only NOW does a click do anything
};

const valley = timeline.hydrated - timeline.htmlPainted;

for (const [event, ms] of Object.entries(timeline)) {
  console.log(`    ${event.padEnd(16)} ${String(ms).padStart(5)}ms`);
}
console.log(`\n    THE UNCANNY VALLEY: ${valley}ms of a page that looks finished and`);
console.log("    ignores every click. The user taps 'Add to cart', nothing happens,");
console.log("    they tap again, and now you have two items in the cart.");

console.log("\n  How this scores in Web Vitals (→ 13):");
console.log("    LCP :", timeline.htmlPainted + "ms ✅ excellent — this is SSR's win, and it is real");
console.log("    INP : a click at 1.5s waits", (timeline.hydrated - 1500) + "ms for a response 🐛");
console.log("\n  Both are true at once, which is the point. SSR did not make the page");
console.log("  fast; it made it VISIBLE early. Whether that is a good trade depends");
console.log("  entirely on whether you then shrink the second half.");
console.log("\n  ⚠️ And note where the time went: 1300ms downloading and parsing JS,");
console.log("  800ms hydrating. The single biggest hydration fix is not a hydration");
console.log("  technique at all — it is shipping less JavaScript. → 04, 06, 08\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — HYDRATION COSTS MORE THAN A CLIENT RENDER
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the counter-intuitive part:\n");

// People assume hydration is cheap because "the DOM already exists". It is not.
// A client render does: run components → build fibers → CREATE nodes → insert.
// Hydration does:       run components → build fibers → MATCH existing nodes →
//                       verify they correspond → attach listeners.
//
// It skips creation and adds matching and verification. Creation was fast;
// running your components was always the expensive part, and hydration still
// does all of it.

const COMPONENTS = 1200;
// Milliseconds per component on a MID-RANGE PHONE — the device that decides
// your field data. On a developer laptop divide by roughly four. → 11 §6
const perComponent = {
  runComponent: 0.35,       // both paths pay this. The dominant cost.
  buildFiber:   0.10,       // both
  createNode:   0.15,       // client render only
  matchNode:    0.13,       // hydration only — walk + compare
  attachEvents: 0.08,       // hydration only
};

const clientRender = COMPONENTS * (perComponent.runComponent + perComponent.buildFiber + perComponent.createNode);
const hydration = COMPONENTS * (perComponent.runComponent + perComponent.buildFiber + perComponent.matchNode + perComponent.attachEvents);

console.log("    1,200 components:");
console.log("      client render (createRoot) : " + clientRender.toFixed(1) + "ms");
console.log("      hydration    (hydrateRoot) : " + hydration.toFixed(1) + "ms",
  hydration > clientRender ? "🐛 MORE, not less" : "");
console.log("\n    where hydration's time goes:");
console.log("      running your components : " + (COMPONENTS * perComponent.runComponent).toFixed(1) +
  "ms  ← " + Math.round(perComponent.runComponent / (hydration / COMPONENTS) * 100) + "% — unavoidable if you ship the component");
console.log("      matching + attaching    : " + (COMPONENTS * (perComponent.matchNode + perComponent.attachEvents)).toFixed(1) + "ms");

console.log("\n  So the equation is: hydration ≈ a client render, minus node creation,");
console.log("  plus matching. The server did not save you the expensive half — it");
console.log("  saved you the cheap half, and bought you an early paint with it.");
console.log("\n  Which gives the only fix that really works: REDUCE THE COMPONENT");
console.log("  COUNT THAT SHIPS. Not the HTML. A page can send 500KB of server-");
console.log("  rendered HTML and hydrate in 12ms if only three components are");
console.log("  interactive. That sentence is the whole idea behind islands and");
console.log("  Server Components. → §7\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — HYDRATION MISMATCHES
// ══════════════════════════════════════════════════════════════════

console.log("§5 — when the server and the client disagree:\n");

// React renders your components on the client and compares the result to the
// server's HTML. If they differ, it cannot trust the markup.
//
// React 18+: it logs an error and DISCARDS the server HTML for that subtree,
// then client-renders it from scratch. So a mismatch is a correctness warning
// AND a performance regression — you paid for SSR and then threw it away.
// React 19 improved the message: it prints a diff showing the server tree
// against the client tree, which makes these dramatically easier to find.

const causes = [
  ["Date.now() / new Date()",     "server time ≠ client time",              "render on the client, or pass a fixed timestamp as a prop"],
  ["Math.random() / uuid()",      "different value every render",           "useId(), or generate on the server and pass it down"],
  ["typeof window !== 'undefined'", "the branch differs by definition",      "useEffect + state, or a client-only dynamic import"],
  ["locale / timezone formatting", "server is UTC, user is IST",            "format on the client, or send an explicit locale + tz"],
  ["localStorage / cookies",      "the server has no localStorage",         "read it in an effect, or send it from the server"],
  ["invalid HTML nesting",        "<div> in <p> — the browser MOVES it",    "fix the markup; the DOM will not match what you rendered"],
];

for (const [cause, why, fix] of causes) {
  console.log(`    🐛 ${cause}`);
  console.log(`         why: ${why}`);
  console.log(`         fix: ${fix}`);
}

// The cost, quantified:
const MISMATCH_SUBTREE = 300;   // components inside the mismatched boundary
const rerenderCost = MISMATCH_SUBTREE * (perComponent.runComponent + perComponent.buildFiber + perComponent.createNode);
console.log("\n    one mismatch in a 300-component subtree:");
console.log("      React discards the server HTML and client-renders it: +" + rerenderCost.toFixed(1) + "ms");
console.log("      → plus a visible flash as the content is replaced, which is also");
console.log("        a layout shift if the sizes differ. → 13 §5");

console.log("\n  The escape hatch, and its limits:");
console.log("    <time suppressHydrationWarning>{now}</time>");
console.log("    It silences the warning for ONE element's text/attributes — one");
console.log("    level deep, not the subtree — and it does NOT make the values match.");
console.log("    Correct for a timestamp or a random id. Wrong as a way to quiet a");
console.log("    real bug: you keep the mismatch and lose the warning.");
console.log("\n  The honest pattern for genuinely client-only content:");
console.log("    const [mounted, setMounted] = useState(false);");
console.log("    useEffect(() => setMounted(true), []);");
console.log("    if (!mounted) return <Skeleton />;   // ← same SIZE as the real thing");
console.log("    Both passes agree (server and first client render both show the");
console.log("    skeleton), so there is no mismatch — but it costs a second render");
console.log("    and, if the skeleton is the wrong size, a layout shift. Framework");
console.log("    APIs like next/dynamic with ssr:false do exactly this for you.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — SELECTIVE HYDRATION (REACT 18)
// ══════════════════════════════════════════════════════════════════

console.log("§6 — Suspense boundaries are the unit of hydration:\n");

// Before 18, hydration was one synchronous, uninterruptible pass over the whole
// tree. A 900ms hydration was a 900ms frozen main thread, and a click during it
// was simply lost.
//
// React 18 changed two things:
//   1. Hydration happens in CHUNKS, one Suspense boundary at a time, and React
//      can YIELD between them so the browser stays responsive.
//   2. If the user interacts with a not-yet-hydrated boundary, React hydrates
//      THAT boundary first — and replays the event once it can. The thing you
//      clicked jumps the queue.

const boundaries = [
  { name: "Header",   components: 40,  order: 1 },
  { name: "Nav",      components: 60,  order: 2 },
  { name: "Comments", components: 700, order: 3 },
  { name: "Product",  components: 120, order: 4 },
  { name: "Footer",   components: 30,  order: 5 },
];
const perComponentMs = perComponent.runComponent + perComponent.buildFiber +
  perComponent.matchNode + perComponent.attachEvents;

const totalComponents = boundaries.reduce((s, b) => s + b.components, 0);
const monolithic = totalComponents * perComponentMs;

// The user clicks "Add to cart" (in Product) at 200ms into hydration.
const inDocumentOrder = boundaries
  .sort((a, b) => a.order - b.order)
  .reduce((acc, b) => {
    acc.push({ name: b.name, doneAt: (acc.at(-1)?.doneAt ?? 0) + b.components * perComponentMs });
    return acc;
  }, []);
const productDefault = inDocumentOrder.find(b => b.name === "Product").doneAt;

// With selective hydration, the clicked boundary is prioritized:
const productPrioritized = 200 + boundaries.find(b => b.name === "Product").components * perComponentMs;

console.log("    5 Suspense boundaries,", totalComponents, "components total");
console.log("      one uninterruptible pass (React 17): " + monolithic.toFixed(0) +
  "ms of frozen main thread 🐛");
console.log("      document order, Product hydrates at : " + productDefault.toFixed(0) + "ms");
console.log("      user clicks Product at 200ms → React hydrates IT first: " +
  productPrioritized.toFixed(0) + "ms ✅");
console.log("      responsiveness improvement          : " +
  (productDefault - productPrioritized).toFixed(0) + "ms on the interaction that mattered");

console.log("\n  Two practical consequences to state:");
console.log("    • Where you put <Suspense> is now a PERFORMANCE decision, not just a");
console.log("      loading-state decision. Boundaries are the chunks React can");
console.log("      prioritize and yield between. One boundary at the root gets you");
console.log("      none of this.");
console.log("    • Put a boundary around anything big and below the fold — a comments");
console.log("      section, a recommendations rail. It hydrates last and the user is");
console.log("      interactive above it long before.");
console.log("\n  Note this is all still ~630ms of total work. Selective hydration");
console.log("  REORDERS and INTERRUPTS it; it does not remove it. Removing it is §7.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — SHIPPING LESS TO HYDRATE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the architectures, priced:\n");

// The only real fix is fewer interactive components on the client. Four levels:

const PAGE = { total: 1200, interactive: 90 };   // 1200 components, 90 need handlers

const architectures = [
  { name: "CSR",                  hydrated: PAGE.total, note: "renders everything client-side; no SSR win at all" },
  { name: "SSR + full hydration", hydrated: PAGE.total, note: "early paint, full tax — the classic Next.js pages router" },
  { name: "Islands (Astro)",      hydrated: PAGE.interactive, note: "static HTML + interactive islands only" },
  { name: "RSC (App Router)",     hydrated: PAGE.interactive, note: "server components never ship JS at all" },
];

for (const a of architectures) {
  const ms = a.hydrated * perComponentMs;
  console.log(`    ${a.name.padEnd(22)} hydrates ${String(a.hydrated).padStart(4)} components → ${ms.toFixed(0).padStart(3)}ms   ${a.note}`);
}

const saving = (PAGE.total - PAGE.interactive) * perComponentMs;
console.log(`\n    islands / RSC save ${saving.toFixed(0)}ms of hydration — and, more importantly,`);
console.log("    the JavaScript for those 1,110 components never ships. That is bundle");
console.log("    size, download time, parse time AND hydration time, all at once.");

console.log("\n  The distinction interviewers probe:");
console.log("    • ISLANDS (Astro, Fresh) — the page is static HTML; you explicitly");
console.log("      mark the interactive bits, and each is hydrated independently.");
console.log("      Islands cannot easily share client state across the page.");
console.log("    • REACT SERVER COMPONENTS — components run ONLY on the server and");
console.log("      send a serialized description of their output. Their code is never");
console.log("      in the bundle. Client Components ('use client') are the hydrated");
console.log("      part, and they can hold state and compose with server output.");
console.log("      The boundary is per component, not per page region.");
console.log("    • Both answer the same question — 'why are we shipping JavaScript");
console.log("      for a component that will never do anything?' — and neither is");
console.log("      free: RSC adds a server round trip and real architectural rules.");
console.log("\n  Smaller wins that do not need an architecture change:");
console.log("    • next/dynamic with ssr:false for genuinely browser-only widgets.");
console.log("    • Do not SSR a page nobody measures LCP on (an authenticated");
console.log("      dashboard). You are paying hydration for nothing.");
console.log("    • useId() for any generated id, so server and client agree. → 2A.2/13");
console.log("    • Fewer, larger components. Hydration scales with COUNT, so a tree");
console.log("      split into 40 tiny wrappers costs more than one that is not.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "The page looks ready but clicks do nothing":
//   The uncanny valley. Ship less JS, use streaming and selective hydration.
//   → §3, §6, 15.
//
// Bug 2 — "Text content did not match. Server: ... Client: ...":
//   A mismatch — usually a date, a random value, or a typeof window branch.
//   → §5.
//
// Bug 3 — SSR "isn't helping" and INP got worse:
//   You added hydration cost without reducing what ships. → §4.
//
// Bug 4 — A whole section flashes and re-renders on load:
//   A mismatch made React discard the server HTML for that subtree. → §5.
//
// Bug 5 — A double-submit because the user clicked twice:
//   The first click landed before hydration and was lost. Disable interactive
//   controls until hydrated, or rely on React 18 replaying the event. → §6.
//
// Bug 6 — suppressHydrationWarning everywhere:
//   The warnings are silenced and the mismatches remain, including the ones
//   that discard server HTML. → §5.
//
// Bug 7 — Hydration is slow on a page that is 95% static text:
//   You are hydrating 1,200 components to make 90 of them clickable. → §7.
//
// Bug 8 — "Hydration failed because the initial UI does not match":
//   Often invalid HTML nesting — a <div> inside a <p>, which the browser
//   silently relocates, so the DOM cannot match what React rendered. → §5.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The valley:
assert(valley === 2600,
  "the page was visible at 800ms and interactive at 3400ms — 2.6s of dead UI 🐛");
assert(timeline.htmlPainted < 2500,
  "SSR's LCP win is real: content painted before the JS even arrived ✅");

// The cost:
assert(hydration > clientRender,
  "hydration costs MORE than a client render — it skips node creation but adds " +
  "matching and attaching 🐛");
assert(+(hydration - clientRender).toFixed(1) === 72, "72ms more across 1,200 components");
assert(COMPONENTS * perComponent.runComponent === 420,
  "running your components is 420ms of it — the half SSR does not save you");

// Mismatch:
assert(causes.length === 6, "six standard causes, and Date/random/window are most of them");
assert(rerenderCost > 0 && +rerenderCost.toFixed(1) === 180,
  "one mismatch client-renders a 300-component subtree from scratch: +180ms and a flash");

// Selective hydration:
assert(totalComponents === 950, "950 components across 5 boundaries");
assert(productPrioritized < productDefault,
  "clicking a boundary makes React hydrate it FIRST — that is selective hydration ✅");
assert(Math.round(productDefault - productPrioritized) === 328,
  "328ms sooner for the interaction the user actually made");

// Architecture:
assert(PAGE.total - PAGE.interactive === 1110,
  "1,110 of 1,200 components never need a handler — islands/RSC stop shipping them");
assert(architectures[2].hydrated === architectures[3].hydrated,
  "islands and RSC arrive at the same place from different directions");

console.log("§9 — mini assertions passed for: Hydration performance");
console.log("\n  The pair that captures it: SSR painted at 800ms and stayed dead");
console.log("  until 3400ms — and hydration cost MORE than a client render would");
console.log("  have, because running your components was never the part it skipped.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is hydration and why is it slow?", answer:
//
//   "The server renders your components to HTML so the browser can paint
//    immediately. But that HTML is inert. Hydration is React running the same
//    components again on the client, walking the existing DOM, matching each
//    node to a component, and attaching state and event handlers.
//
//    The counter-intuitive part is that hydration isn't cheaper than a client
//    render — it's usually slightly more expensive. It skips creating DOM nodes,
//    which was never the slow part, and it adds matching and verification. The
//    dominant cost is running your component functions, and hydration still does
//    all of that.
//
//    So SSR isn't 'faster'. It moves the paint earlier and interactivity later.
//    In between is the uncanny valley — in my example, visible at 0.8 seconds and
//    dead until 3.4. That's excellent LCP and terrible INP at the same time, and
//    the user experience is tapping 'add to cart' twice.
//
//    Mismatches are the other half of the topic. React compares its client render
//    to the server HTML, and if they differ it discards the server markup for that
//    subtree and client-renders it — so a mismatch costs you the SSR you paid for,
//    plus a visible flash. The causes are always the same handful: Date.now,
//    Math.random, a typeof window branch, locale or timezone formatting,
//    localStorage, and invalid HTML nesting like a div inside a p, where the
//    browser relocates the node so the DOM can't match. suppressHydrationWarning
//    is right for a timestamp and wrong as a way to silence a real bug.
//
//    React 18 helped in two ways: hydration happens per Suspense boundary and can
//    yield between them, so the main thread isn't frozen; and if the user
//    interacts with a boundary that hasn't hydrated yet, React prioritizes that
//    one and replays the event. That makes Suspense placement a performance
//    decision, not just a loading-state decision.
//
//    But that reorders the work rather than removing it. The real fix is to
//    hydrate fewer components, because the cost scales with component count, not
//    HTML size. That's what islands and Server Components both do — in my example
//    1,110 of 1,200 components never needed a handler, so their JavaScript never
//    has to ship at all. That's bundle size, parse time and hydration time in one
//    move. And the simplest version of the same insight: don't server-render a
//    page nobody measures LCP on. An authenticated dashboard pays hydration for
//    an LCP nobody is looking at."
//
// "Hydration costs more than a client render", the mismatch→discard consequence,
// and "cost scales with component count, not HTML size" are the three lines that
// mark real understanding.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does hydration do?
// A1. Re-runs components on the client, matches them to existing server HTML,
//     and attaches state and event handlers.
//
// Q2. Is hydration cheaper than a client render?
// A2. No — usually slightly more. It skips node creation and adds matching. The
//     expensive part, running your components, is unchanged.
//
// Q3. What's the uncanny valley?
// A3. The window where content is painted but not interactive. Great LCP,
//     terrible INP.
//
// Q4. What causes a hydration mismatch?
// A4. Date/random values, typeof window branches, locale/timezone formatting,
//     localStorage, and invalid HTML nesting.
//
// Q5. What does React do on a mismatch?
// A5. Logs an error and discards the server HTML for that subtree, client-
//     rendering it instead — so you lose the SSR benefit and get a flash.
//
// Q6. When is suppressHydrationWarning correct?
// A6. For a value that legitimately differs, like a timestamp. It suppresses
//     one element, one level deep, and doesn't fix the mismatch.
//
// Q7. What is selective hydration?
// A7. React 18 hydrates per Suspense boundary, can yield between them, and
//     prioritizes a boundary the user interacts with, replaying the event.
//
// Q8. What does hydration cost scale with?
// A8. The number of components shipped to the client — not the amount of HTML.
//
// Q9. Islands vs Server Components?
// A9. Islands: static page with explicitly marked interactive regions. RSC:
//     components run only on the server and never ship their code; the
//     boundary is per component.
//
// Q10. When would you NOT use SSR?
// A10. When nobody measures the first paint — an authenticated dashboard, an
//      internal tool. You'd pay hydration for an LCP nobody sees.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is hydration?
//   Back : Re-running components on the client to attach state and handlers to
//          existing server HTML.
//
// Flashcard 2:
//   Front: Cheaper than a client render?
//   Back : No. Skips node creation, adds matching. Running components dominates.
//
// Flashcard 3:
//   Front: The uncanny valley?
//   Back : Painted but dead. Great LCP, terrible INP.
//
// Flashcard 4:
//   Front: What happens on a mismatch?
//   Back : React discards the server HTML for that subtree and client-renders it.
//
// Flashcard 5:
//   Front: What is selective hydration?
//   Back : Per-Suspense-boundary hydration that can yield, and prioritizes what
//          the user clicked.
//
// Flashcard 6:
//   Front: Hydration cost scales with…?
//   Back : Component count, not HTML size.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "SSR trades a later paint for an earlier one and adds a bill after
//          it" — then name islands/RSC as the way to shrink the bill.


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build a Next.js page, throttle to Slow 4G + 6× CPU, and click a button as
//   soon as you see it. Measure how long before it responds.
//
// Task 2:
//   Cause a mismatch on purpose with new Date().toLocaleString(). Read the
//   console error and watch the subtree re-render.
//
// Task 3:
//   Fix it three ways: suppressHydrationWarning, the mounted-flag pattern, and
//   passing a server timestamp as a prop. Compare the trade-offs.
//
// Task 4:
//   Wrap a large below-the-fold section in <Suspense> and watch it hydrate
//   separately in the Performance panel.
//
// Task 5:
//   Convert a static page section to a Server Component and diff the client
//   bundle before and after.
//
// Task 6:
//   Count the components on one of your pages and how many actually need a
//   handler. That ratio is your islands/RSC opportunity.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   SSR paints early; hydration is the bill. The gap between them is visible,
//   dead UI.
//
// If you remember the common bug:
//   A mismatch — Date, random, typeof window, or invalid nesting — makes React
//   throw away the server HTML you paid for.
//
// If you remember the professional framing:
//   Hydration cost scales with COMPONENT COUNT, not HTML size. Selective
//   hydration reorders the work; islands and Server Components remove it.
//
// NEXT TOPIC -> 15_suspense-and-streaming.js
