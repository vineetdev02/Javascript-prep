// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  15_suspense-and-streaming.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Suspense & streaming
//
// WHAT YOU WILL MASTER HERE:
//   1. The one protocol behind lazy, data fetching, and streaming SSR
//   2. What can and cannot suspend — the question people get wrong
//   3. Streaming SSR: shell first, chunks after — TTFB and FCP, MEASURED
//   4. How the swap actually works on the wire (there is no client round trip)
//   5. Parallel boundaries vs the request waterfall they replace
//   6. Transitions: why startTransition stops the fallback flash
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/15_suspense-and-streaming.js"
//
// Prerequisites: 04 and 05 (Suspense for code), 13 (the metrics), 14 (hydration
// and selective hydration). This is the LAST file of Section 2A.4 and it ties
// the load half of the section together.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Suspense & streaming:
// <Suspense> lets a component say "I am not ready" without blocking its
// siblings; streaming SSR lets the SERVER send the ready parts of the page
// immediately and push the rest down the same response as they finish.
//
// If interviewer says "explain it simply", say:
// "Suspense is a boundary that shows a fallback while something inside it is
//  loading. On the server, that means React doesn't have to wait for the slowest
//  query before sending anything — it sends the page with a placeholder where
//  the slow part goes, and streams the real content into the same response when
//  it's ready."
//
// If interviewer asks "why does it matter?", say:
// "Because it removes the all-or-nothing choice that defined SSR for years.
//  Classic renderToString had to finish the entire tree before it could send a
//  single byte, so one slow database call set your TTFB. Streaming makes the
//  page's speed depend on its FASTEST part instead of its slowest. And it
//  composes with selective hydration, so a streamed section becomes interactive
//  as it arrives rather than after everything has hydrated. It's the same throw-
//  a-promise protocol as React.lazy — one mechanism doing code, data and HTML."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   The page is as fast as its FASTEST part
//
// The protocol, identical everywhere (→ 05 §3):
//   1. A component needs something that is not ready.
//   2. It THROWS the pending promise.
//   3. The nearest <Suspense> ancestor catches it and renders `fallback`.
//   4. The promise resolves. React retries that subtree.
//
// Runtime rule:
//   The boundary is the unit of everything — the unit of loading UI, the unit of
//   streaming, and the unit of hydration. Where you put <Suspense> decides all
//   three at once.
//
// Practical rule:
//   One boundary per independently-loadable region. Not one at the root, and not
//   one per component.
//
// Common trap:
//   Expecting a plain `useEffect(() => fetch(...))` to trigger Suspense. It does
//   not. Suspense needs something that THROWS a promise during render — lazy(),
//   use(), or a framework/library integration. An effect runs after the render
//   has already committed, so there is nothing to suspend.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHAT CAN SUSPEND
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what actually triggers a Suspense boundary:\n");

const sources = [
  ["React.lazy(() => import(...))",   true,  "the original use — a code chunk. → 05"],
  ["use(promise) (React 19)",         true,  "unwraps any promise during render; can be conditional"],
  ["A Server Component awaiting data", true,  "the framework suspends at the boundary"],
  ["React Query / Relay suspense mode", true, "opt-in; the library throws for you"],
  ["useEffect + fetch + setState",    false, "🐛 the effect runs AFTER the commit. Nothing to suspend."],
  ["An async component function (client)", false, "🐛 client components cannot be async"],
  ["A slow synchronous render",       false, "🐛 not waiting on anything — just slow. → 01-03"],
];

for (const [source, suspends, note] of sources) {
  console.log(`    ${suspends ? "✅" : "❌"} ${source.padEnd(38)} ${note}`);
}

console.log("\n  Row 5 is the misconception worth naming out loud. People wrap a");
console.log("  component that fetches in useEffect in <Suspense> and wonder why the");
console.log("  fallback never appears. The render COMPLETED — with empty data — and");
console.log("  committed. Suspense is a render-time protocol; effects are post-commit.");
console.log("  Data suspense requires a library or framework that throws during render.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — STREAMING SSR: THE SHELL AND THE CHUNKS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — one slow query no longer holds the page:\n");

// The APIs:
//   Node:      renderToPipeableStream(<App/>, { onShellReady, onAllReady })
//   Web/Edge:  renderToReadableStream(<App/>)
//   Legacy:    renderToString — synchronous, no Suspense, all-or-nothing
//
// The SHELL is everything OUTSIDE your Suspense boundaries. React sends it as
// soon as it is ready. Each boundary's content follows when its data resolves.

const regions = [
  { name: "shell (nav, layout, hero)", ms: 120, suspense: false },
  { name: "ProductInfo",               ms: 180, suspense: true },
  { name: "Reviews",                   ms: 900, suspense: true },
  { name: "Recommendations",           ms: 1400, suspense: true },
];

const slowest = Math.max(...regions.map(r => r.ms));
const shell = regions.find(r => !r.suspense).ms;

console.log("    renderToString (blocking):");
console.log("      TTFB / FCP :", slowest + "ms — nothing is sent until Recommendations finishes 🐛");
console.log("      the user stares at a white page for the length of your SLOWEST query.");

console.log("\n    renderToPipeableStream (streaming):");
console.log("      TTFB / FCP :", shell + "ms ✅ — the shell goes out immediately");
for (const r of regions.filter(x => x.suspense)) {
  console.log(`        └─ ${r.name.padEnd(18)} streams in at ${r.ms}ms (fallback shown until then)`);
}
console.log("      last byte  :", slowest + "ms — the same total, but nobody waited for it");

console.log("\n    improvement to first paint: " + (slowest - shell) + "ms (" +
  Math.round((1 - shell / slowest) * 100) + "% sooner)");

console.log("\n  Say the reframing precisely, because it is the whole idea:");
console.log("    blocking  → the page is as slow as its SLOWEST part");
console.log("    streaming → the page is as fast as its FASTEST part");
console.log("\n  And note what did NOT change: total work, and the moment the last byte");
console.log("  arrives. Streaming reorders delivery. It does not make your database");
console.log("  faster — which is exactly why it is safe to reach for.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — HOW THE SWAP WORKS ON THE WIRE
// ══════════════════════════════════════════════════════════════════
//
// This is the detail that turns a memorized answer into a real one, because the
// obvious guess — "the client fetches it afterwards" — is wrong. It is all ONE
// HTTP response.
//
//   1. React sends the shell, with a PLACEHOLDER where the boundary is:
//
//        <main>
//          <h1>Product</h1>
//          <!--$?--><template id="B:0"></template><div>Loading reviews…</div><!--/$-->
//        </main>
//
//      That comment syntax is React's boundary marker, and the fallback HTML is
//      right there — so the user sees it with no JavaScript at all.
//
//   2. The response STAYS OPEN. When Reviews resolves, React appends:
//
//        <div hidden id="S:0"><ul>…the real reviews…</ul></div>
//        <script>$RC("B:0","S:0")</script>
//
//   3. That tiny inline script — React ships it in the first chunk — moves the
//      real content into place and removes the fallback. It runs the moment it
//      is parsed, before your bundle has loaded.
//
// Three consequences worth stating:
//   • NO CLIENT ROUND TRIP. The content came down the original response.
//   • IT WORKS BEFORE HYDRATION, and even with the main bundle still downloading.
//     Streaming and hydration are independent — that is why §7 matters.
//   • THE CONTENT IS IN THE HTML, so crawlers that do not execute your app still
//     see it. Streamed SSR is SEO-safe in a way client fetching is not.
//
//   • OUT-OF-ORDER: if Recommendations (1400ms) is above Reviews (900ms) in the
//     document, Reviews still streams in FIRST and is placed correctly. React
//     does not serialize on document order.

console.log("§5 — out-of-order delivery, in document order on screen:\n");
const documentOrder = ["Recommendations", "Reviews", "ProductInfo"];
const arrivalOrder = [...regions.filter(r => r.suspense)].sort((a, b) => a.ms - b.ms).map(r => r.name);
console.log("    document order :", documentOrder.join(" → "));
console.log("    arrival order  :", arrivalOrder.join(" → "), "← by resolution time");
console.log("    final layout   : correct, because $RC() places each chunk by id ✅\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — BOUNDARY PLACEMENT IS THE DESIGN
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the same page, three boundary layouts:\n");

function firstPaint(layout) {
  if (layout === "none") return { fcp: slowest, interactiveAt: slowest, note: "one slow query blocks everything 🐛" };
  if (layout === "root") return { fcp: 20, interactiveAt: slowest, note: "instant spinner, then the whole page at once 🐛" };
  return { fcp: shell, interactiveAt: shell, note: "real content immediately, slow parts fill in ✅" };
}

for (const [label, key] of [
  ["no Suspense at all      ", "none"],
  ["one boundary at the root", "root"],
  ["one per slow region     ", "regions"],
]) {
  const r = firstPaint(key);
  console.log(`    ${label} → FCP ${String(r.fcp).padStart(4)}ms   ${r.note}`);
}

console.log("\n  The middle row is the mistake people make after learning about");
console.log("  streaming: they wrap the app in one <Suspense> and technically stream");
console.log("  a spinner. FCP looks fantastic and the experience is worse than before,");
console.log("  because a spinner is not content. What you want in the shell is the");
console.log("  nav, the layout and the hero — things that need no data.");
console.log("\n  Boundary placement rules:");
console.log("    • Shell = everything that needs NO data. Send it instantly.");
console.log("    • One boundary per independently-loadable region.");
console.log("    • Do not nest boundaries on one screen — that is 04 §6's waterfall,");
console.log("      and it applies to data exactly as it does to code.");
console.log("    • Size the fallback like the real content, or you have designed a");
console.log("      layout shift. → 13 §5");
console.log("    • In Next.js App Router, a loading.tsx file IS a Suspense boundary");
console.log("      around that route segment — same mechanism, less typing.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — STREAMING + SELECTIVE HYDRATION
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the two halves, together:\n");

// Streaming gets HTML to the user early (→ §4). Selective hydration makes each
// streamed region interactive independently (→ 14 §6). Together they remove the
// all-or-nothing property from BOTH halves of server rendering.

const HYDRATE_MS_PER_COMPONENT = 0.66;     // mid-range phone, from 14 §4
const pageRegions = [
  { name: "shell",           components: 80,  htmlAt: 120 },
  { name: "ProductInfo",     components: 120, htmlAt: 180 },
  { name: "Reviews",         components: 700, htmlAt: 900 },
  { name: "Recommendations", components: 300, htmlAt: 1400 },
];
const totalComponents = pageRegions.reduce((s, r) => s + r.components, 0);

// Old model: wait for ALL html, then hydrate EVERYTHING in one pass.
const allHtmlAt = Math.max(...pageRegions.map(r => r.htmlAt));
const monolithic = allHtmlAt + totalComponents * HYDRATE_MS_PER_COMPONENT;

// New model: each region hydrates as it arrives; the important one first.
const productInteractive = pageRegions[1].htmlAt +
  (pageRegions[0].components + pageRegions[1].components) * HYDRATE_MS_PER_COMPONENT;

console.log("    blocking SSR + one hydration pass:");
console.log("      ProductInfo interactive at:", Math.round(monolithic) + "ms 🐛");
console.log("    streaming + selective hydration:");
console.log("      ProductInfo interactive at:", Math.round(productInteractive) + "ms ✅");
console.log("      improvement               :", Math.round(monolithic - productInteractive) + "ms");

console.log("\n  Read what happened: the 700-component Reviews section — the slowest");
console.log("  data AND the biggest hydration cost — no longer sits between the user");
console.log("  and the Add to Cart button. That is the argument for both features in");
console.log("  one sentence, and it is an INP argument. → 13 §6\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — TRANSITIONS, AND THE FALLBACK FLASH
// ══════════════════════════════════════════════════════════════════
//
// A Suspense boundary that already has content, then suspends again — a tab
// change, a new search — REPLACES that content with the fallback. The user sees
// their results vanish and a spinner appear. That is worse than a brief stale
// view, and it is a CLS event too.
//
//   ❌ setTab("reviews");                    // boundary suspends → content gone
//
//   ✅ startTransition(() => setTab("reviews"));
//      → React keeps the OLD content on screen while the new one loads. The
//        fallback is not shown for a transition. isPending gives you a subtle
//        indicator instead — dim the panel, show a bar.
//
//   ✅ useDeferredValue(query)
//      → the same idea for a value: the expensive subtree keeps rendering the
//        previous query while the input stays at 60fps. → 02_built-in-hooks/11
//
// The rule, said cleanly:
//   Suspense fallbacks are for content the user has NEVER seen.
//   Transitions are for content they are REPLACING.
//   Showing a fallback for a replacement is a downgrade every time.

console.log("§8 — replacing content: fallback vs transition:\n");
const scenarios = [
  ["initial load, no content yet", "show the fallback", "✅ correct — there is nothing to keep"],
  ["switching tabs",               "startTransition",   "✅ keep the old tab until the new one is ready"],
  ["typing in a search box",       "useDeferredValue",  "✅ keep the last results; input stays responsive"],
  ["switching tabs, no transition", "fallback flash",   "🐛 content vanishes; also a layout shift"],
];
for (const [when, use, verdict] of scenarios) {
  console.log(`    ${when.padEnd(30)} → ${use.padEnd(18)} ${verdict}`);
}
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 9 — LIMITS AND FAILURE MODES
// ══════════════════════════════════════════════════════════════════
//
// Say these unprompted.
//
//   • SUSPENSE DOES NOT CATCH ERRORS. Pending is Suspense; rejected is an Error
//     Boundary, placed OUTSIDE it. → 04 §8, 05 §3.
//   • STREAMING DOES NOT MAKE ANYTHING FASTER. It reorders delivery. If every
//     query is slow, every boundary shows a fallback and you have streamed a
//     page of spinners. Fix the queries.
//   • YOU CANNOT SET HTTP STATUS OR HEADERS AFTER THE STREAM STARTS. Once the
//     shell is sent, a later failure cannot become a 500 or a redirect. This is
//     a genuine architectural constraint: put anything that decides a status
//     code — auth, a 404 lookup — BEFORE or IN the shell.
//   • SOME CDNs AND PROXIES BUFFER. A misconfigured layer in front of you can
//     hold the whole response and silently undo streaming. Verify with curl on
//     the real deployment, not localhost.
//   • A FALLBACK THE WRONG SIZE IS A LAYOUT SHIFT you designed. → 13 §5.
//   • TOO MANY BOUNDARIES is visual noise — six spinners resolving at different
//     times reads as a broken page, even though every number improved.
//   • BOUNDARIES ARE ALSO HYDRATION UNITS, so placement affects interactivity,
//     not just loading UI. → §7, 14 §6.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The Suspense fallback never appears:
//   The component fetches in useEffect. Nothing throws during render. → §3.
//
// Bug 2 — Great FCP, terrible experience:
//   One boundary at the root, so you streamed a spinner instead of content.
//   → §6.
//
// Bug 3 — Content flashes away when switching tabs:
//   A boundary re-suspending without startTransition. → §8.
//
// Bug 4 — Streaming works locally, not in production:
//   A CDN or proxy buffering the response. → §9.
//
// Bug 5 — "Cannot set headers after they are sent":
//   Something tried to redirect or set a status after the shell streamed. → §9.
//
// Bug 6 — A rejected fetch crashes the page:
//   No Error Boundary. Suspense only handles pending. → §9.
//
// Bug 7 — Three spinners appear one after another:
//   Nested boundaries — the data version of 04 §6's waterfall.
//
// Bug 8 — The page jumps as sections stream in:
//   Fallbacks that are not the size of the content. → §6, 13 §5.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// What suspends:
assert(sources.filter(s => s[1]).length === 4, "four things suspend: lazy, use, RSC, and opt-in libraries");
assert(sources.find(s => s[0].startsWith("useEffect"))[1] === false,
  "useEffect + fetch does NOT suspend — the effect runs after the commit 🐛");

// Streaming:
assert(slowest === 1400 && shell === 120, "the slowest region is 1400ms; the shell is ready at 120ms");
assert(slowest - shell === 1280,
  "blocking SSR sends the first byte at 1400ms; streaming sends it at 120ms — 1280ms sooner ✅");
assert(Math.round((1 - shell / slowest) * 100) === 91, "a 91% earlier first paint");

// Out of order:
assert(arrivalOrder[0] === "ProductInfo" && arrivalOrder[2] === "Recommendations",
  "chunks arrive by RESOLUTION time, not document order");

// Boundary placement:
assert(firstPaint("none").fcp === 1400, "no boundaries → the slowest query sets FCP 🐛");
assert(firstPaint("root").fcp === 20 && firstPaint("root").interactiveAt === 1400,
  "one root boundary → an instant spinner and no earlier content 🐛");
assert(firstPaint("regions").fcp === 120,
  "boundaries per region → real content at 120ms ✅");

// Streaming + selective hydration:
assert(totalComponents === 1200, "1,200 components on the page");
assert(Math.round(monolithic) === 2192,
  "blocking + one hydration pass: Add to Cart works at 2192ms 🐛");
assert(Math.round(productInteractive) === 312,
  "streaming + selective hydration: 312ms ✅ — Reviews is no longer in the way");
assert(Math.round(monolithic - productInteractive) === 1880, "1880ms sooner on the button that matters");

console.log("§11 — mini assertions passed for: Suspense & streaming");
console.log("\n  The pair that captures it: the first byte moved from 1400ms to 120ms");
console.log("  because the page stopped waiting for its slowest query — and the Add");
console.log("  to Cart button became clickable 1880ms sooner because it stopped");
console.log("  waiting for a 700-component reviews list to hydrate.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Suspense / how does streaming SSR work?", answer:
//
//   "Suspense is a boundary that catches a component saying 'I'm not ready'. The
//    protocol is the same one React.lazy uses: the component throws a pending
//    promise, the nearest boundary renders its fallback, and React retries that
//    subtree when it resolves. One mechanism covering code, data and HTML.
//
//    The thing to be precise about is what can suspend. lazy, use() in React 19,
//    a Server Component awaiting data, and libraries in suspense mode. NOT a
//    useEffect fetch — the effect runs after the render has already committed, so
//    there's nothing to suspend. That's the most common misconception.
//
//    On the server, streaming is what that buys you. Classic renderToString is
//    synchronous and all-or-nothing: it has to finish the entire tree before it
//    sends a byte, so your TTFB is your slowest query. renderToPipeableStream
//    sends the SHELL — everything outside your boundaries — immediately, and
//    streams each boundary's content into the same open response as its data
//    resolves. In my example that moved the first byte from 1400ms to 120ms.
//    The reframe I'd offer: blocking means the page is as slow as its slowest
//    part, streaming means it's as fast as its fastest part.
//
//    The mechanism is worth knowing because the obvious guess is wrong. It isn't
//    a client fetch. React sends the fallback HTML inline with a boundary marker,
//    keeps the response open, and when the content is ready appends it in a
//    hidden div plus a tiny inline script that moves it into place. So it works
//    before hydration, before your bundle has even loaded, and the content is
//    real HTML — which means it's SEO-safe. And it's out of order: a section
//    lower in the document that resolves first arrives first and still lands in
//    the right place.
//
//    Two mistakes I'd flag. One boundary at the root technically streams, but you
//    stream a spinner — great FCP, worse experience. The shell should be your
//    nav, layout and hero, the things that need no data. And a boundary that
//    already has content will replace it with the fallback when it re-suspends,
//    so tab switches and new searches need startTransition or useDeferredValue —
//    fallbacks are for content the user has never seen, transitions are for
//    content they're replacing.
//
//    Where it really pays is combined with selective hydration, because the
//    boundary is the unit of both. Each region becomes interactive as it arrives.
//    In my numbers the Add to Cart button worked 1.9 seconds sooner, because a
//    700-component reviews list stopped sitting between the user and the button.
//    That's an INP argument, not a loading-spinner one.
//
//    The limits: Suspense handles pending, not rejected — you still need an Error
//    Boundary outside it. You can't set a status code or redirect once the shell
//    is sent, so auth and 404 checks belong before it. And a proxy that buffers
//    silently undoes the whole thing, so I'd verify with curl against the real
//    deployment."
//
// The wire-level explanation, "fallbacks vs transitions", and tying it to
// selective hydration are what make this the strongest answer in the section.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What can trigger Suspense?
// A1. Anything that throws a promise during render: lazy, use(), Server
//     Components awaiting data, libraries in suspense mode. Not useEffect.
//
// Q2. How is streaming SSR different from renderToString?
// A2. renderToString is synchronous and all-or-nothing. Streaming sends the
//     shell immediately and pushes each boundary's content as it resolves.
//
// Q3. How does the content get swapped in?
// A3. Same response: a hidden div with the real HTML plus a tiny inline script
//     that moves it into the boundary's placeholder. No client round trip.
//
// Q4. Does streaming make the page faster?
// A4. It reorders delivery. Total work and last-byte time are unchanged — but
//     first paint depends on the fastest part instead of the slowest.
//
// Q5. Is streamed content SEO-safe?
// A5. Yes — it's real HTML in the response, unlike client-side fetching.
//
// Q6. Where should boundaries go?
// A6. One per independently-loadable region, with a data-free shell. Not one at
//     the root, not one per component.
//
// Q7. Why does my content disappear when I switch tabs?
// A7. The boundary re-suspended. Wrap the update in startTransition so React
//     keeps the old content.
//
// Q8. What can't you do once streaming starts?
// A8. Set a status code, set headers, or redirect. Those decisions must happen
//     before the shell is sent.
//
// Q9. How does this interact with hydration?
// A9. The boundary is also the hydration unit — each region hydrates as it
//     arrives, and React prioritizes one the user interacts with.
//
// Q10. Does Suspense catch errors?
// A10. No. Pending only. Rejected needs an Error Boundary outside it.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The Suspense protocol?
//   Back : Throw a pending promise; the nearest boundary shows a fallback and
//          retries on resolve.
//
// Flashcard 2:
//   Front: Does useEffect + fetch suspend?
//   Back : No. Effects run after the commit; Suspense is render-time.
//
// Flashcard 3:
//   Front: What is the shell?
//   Back : Everything outside your Suspense boundaries. It streams first.
//
// Flashcard 4:
//   Front: How does the real content arrive?
//   Back : Same open response — hidden div plus an inline script that moves it.
//
// Flashcard 5:
//   Front: Fallback or transition?
//   Back : Fallback for content never seen. Transition for content being
//          replaced.
//
// Flashcard 6:
//   Front: What can't you do after the shell is sent?
//   Back : Change status, headers, or redirect.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Blocking = as slow as the slowest part; streaming = as fast as the
//          fastest" — plus the boundary is also the hydration unit.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build a Next.js App Router page with one fast and one slow (await sleep)
//   section. Add loading.tsx and watch the shell arrive first.
//
// Task 2:
//   `curl -N` your streaming endpoint and read the raw chunks. Find the boundary
//   comment, the hidden div, and the $RC script.
//
// Task 3:
//   Move the boundary to the root and compare the experience. Note that FCP
//   improved and the page got worse.
//
// Task 4:
//   Wrap a data-suspending component in <Suspense> and fetch in useEffect
//   instead. Confirm the fallback never shows.
//
// Task 5:
//   Build tab switching over a suspending boundary. Feel the fallback flash,
//   then add startTransition and feel it stop.
//
// Task 6:
//   Deploy behind a CDN and verify with curl that streaming still works. Find
//   out whether anything buffers.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Streaming makes the page as fast as its FASTEST part instead of its slowest
//   — and it all arrives in one open response, before hydration.
//
// If you remember the common bug:
//   useEffect fetching does not suspend, and one boundary at the root just
//   streams a spinner.
//
// If you remember the professional framing:
//   The boundary is the unit of loading UI, streaming AND hydration. Fallbacks
//   are for content never seen; transitions are for content being replaced.
//
// ─────────────────────────────────────────────────────────────────
// END OF SECTION 2A.4 — PERFORMANCE.
// NEXT SECTION -> section-2a.5-patterns-and-architecture/06_design-patterns/
// ─────────────────────────────────────────────────────────────────
