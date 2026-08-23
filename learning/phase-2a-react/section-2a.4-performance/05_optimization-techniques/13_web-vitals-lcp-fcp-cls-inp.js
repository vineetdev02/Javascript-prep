// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  13_web-vitals-lcp-fcp-cls-inp.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Web Vitals (LCP, FCP, CLS, INP)
//
// WHAT YOU WILL MASTER HERE:
//   1. The three Core Web Vitals, their thresholds, and the p75 rule
//   2. INP replaced FID in March 2024 — what changed and why it is harder
//   3. CLS: the actual formula, computed — impact × distance
//   4. Each metric broken into its sub-parts, which is where the fixes live
//   5. Field vs lab data, and why Lighthouse cannot tell you your INP
//   6. The React map: which of this section's techniques moves which metric
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/13_web-vitals-lcp-fcp-cls-inp.js"
//
// Prerequisites: all of 01-12. This is the file that connects them to something
// a product manager cares about — every technique in this section exists to move
// one of these numbers, and this is where you learn to say WHICH.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Web Vitals:
// Google's standardized, user-centric performance metrics — how fast the main
// content appears (LCP), how stable the layout is (CLS), and how quickly the
// page responds to interaction (INP) — measured on real users at the 75th
// percentile.
//
// If interviewer says "explain it simply", say:
// "Three numbers that stand in for three questions a user asks without thinking:
//  did it load, did it stay still, and did it respond? LCP, CLS and INP."
//
// If interviewer asks "why does it matter?", say:
// "Because they're the shared language between engineering, product and SEO.
//  They're a Google ranking input, so they get budget. But the reason I like them
//  is that they're measured on REAL users at p75 — not on my laptop — so they
//  can't be gamed by a fast machine. And for React specifically, INP is the
//  metric that all the render optimization work actually shows up in. If I can't
//  say which vital a memo moved, I probably shouldn't have written it."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   LOAD · STABILITY · RESPONSE
//
//   LCP — Largest Contentful Paint   "did it load?"       ← loading
//   CLS — Cumulative Layout Shift    "did it stay still?" ← visual stability
//   INP — Interaction to Next Paint  "did it respond?"    ← responsiveness
//
// The supporting cast (diagnostics, not Core):
//   FCP  — First Contentful Paint. The first pixel of ANYTHING. Diagnoses LCP.
//   TTFB — Time to First Byte. Server + network. Diagnoses FCP.
//   TBT  — Total Blocking Time. A LAB proxy for INP; Lighthouse reports it
//          because it cannot measure real interactions.
//
// Runtime rule:
//   Assessment is at the 75th PERCENTILE of page loads, per metric, segmented by
//   mobile and desktop. Not the average. 25% of your users may be worse than the
//   number you are judged on — which is the point, because averages hide the
//   tail and the tail is who complains.
//
// Practical rule:
//   Fix in this order: whichever one is failing. Then INP, because React
//   applications fail INP far more often than LCP.
//
// Common trap:
//   Optimizing to a Lighthouse score. Lighthouse is a LAB tool on a simulated
//   device with no user, so it cannot measure INP or real CLS at all, and a
//   green 100 with a failing field CLS is completely normal.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE THRESHOLDS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the numbers, and what they judge:\n");

const VITALS = [
  { metric: "LCP",  good: 2500, poor: 4000, unit: "ms", core: true,  measures: "largest element painted" },
  { metric: "INP",  good: 200,  poor: 500,  unit: "ms", core: true,  measures: "interaction → next paint" },
  { metric: "CLS",  good: 0.1,  poor: 0.25, unit: "",   core: true,  measures: "unexpected layout shift" },
  { metric: "FCP",  good: 1800, poor: 3000, unit: "ms", core: false, measures: "first pixel of content" },
  { metric: "TTFB", good: 800,  poor: 1800, unit: "ms", core: false, measures: "server + network" },
];

console.log("    metric  core   good        needs work        poor        what it measures");
for (const v of VITALS) {
  const g = `≤ ${v.good}${v.unit}`;
  const n = `${v.good}-${v.poor}${v.unit}`;
  const p = `> ${v.poor}${v.unit}`;
  console.log(`    ${v.metric.padEnd(7)}${(v.core ? "✅" : "  ").padEnd(6)} ${g.padEnd(11)} ${n.padEnd(17)} ${p.padEnd(11)} ${v.measures}`);
}

function rate(metric, value) {
  const v = VITALS.find(x => x.metric === metric);
  return value <= v.good ? "good" : value <= v.poor ? "needs-improvement" : "poor";
}

console.log("\n    a real report for one page (p75, mobile):");
const report = [["LCP", 3100], ["INP", 480], ["CLS", 0.04], ["FCP", 1600], ["TTFB", 620]];
for (const [m, value] of report) {
  const r = rate(m, value);
  console.log(`      ${m.padEnd(5)} ${String(value).padStart(6)}  ${r}${r === "good" ? " ✅" : r === "poor" ? " 🐛" : " ⚠️"}`);
}
console.log("\n  Reading it: CLS is fine, FCP and TTFB are fine — so the server and the");
console.log("  first paint are healthy, and LCP is still 3.1s. That combination points");
console.log("  at the LCP element itself (a hero image, or content that waits on JS),");
console.log("  not at the network. And INP at 480ms is the real emergency: the page");
console.log("  loads acceptably and then feels broken when you touch it. That is the");
console.log("  classic React profile. → §6\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — LCP, TAKEN APART
// ══════════════════════════════════════════════════════════════════

console.log("§4 — LCP is four sub-parts, and each has a different fix:\n");

// The LCP element is the largest image, video poster, background image, or block
// of text in the viewport. Google's own breakdown:

const lcpParts = [
  { part: "TTFB",                  ms: 620, fix: "server, CDN, caching, edge rendering" },
  { part: "resource load delay",   ms: 900, fix: "🐛 preload it; stop discovering it late" },
  { part: "resource load time",    ms: 1100, fix: "🐛 compress, resize, modern format (AVIF/WebP)" },
  { part: "element render delay",  ms: 480, fix: "reduce render-blocking CSS/JS; SSR the element" },
];
const lcpTotal = lcpParts.reduce((s, p) => s + p.ms, 0);

for (const p of lcpParts) {
  const share = Math.round(p.ms / lcpTotal * 100);
  console.log(`    ${p.part.padEnd(22)} ${String(p.ms).padStart(5)}ms  ${String(share).padStart(2)}%  ${p.fix}`);
}
console.log(`    ${"TOTAL LCP".padEnd(22)} ${String(lcpTotal).padStart(5)}ms  → ${rate("LCP", lcpTotal)} 🐛`);

console.log("\n  Two thirds of that is the hero image being found late and downloaded");
console.log("  slowly. So the fixes, in the order they pay:");
console.log("    • <link rel='preload' as='image' href='hero.avif' fetchpriority='high'>");
console.log("      — or fetchpriority='high' on the <img> itself. Kills the load DELAY.");
console.log("    • NEVER loading='lazy' on an above-the-fold image. This is the most");
console.log("      common self-inflicted LCP wound: a blanket lazy-loading rule that");
console.log("      also delays the one image that defines LCP.");
console.log("    • Serve AVIF/WebP at the displayed size with srcset. Kills load TIME.");
console.log("    • If the LCP element is rendered by JS, it cannot paint until the");
console.log("      bundle arrives, parses and hydrates. SSR it, or make it static HTML.");
console.log("      → This is where 04 (code splitting) and 08 (bundle size) pay off.");
console.log("    • next/image and similar do most of this for you: dimensions, modern");
console.log("      formats, srcset, and priority for the hero.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — CLS: THE ACTUAL FORMULA
// ══════════════════════════════════════════════════════════════════

console.log("§5 — CLS computed, not quoted:\n");

//   layout shift score = impact fraction × distance fraction
//
//   impact fraction   = share of the VIEWPORT affected by unstable elements
//   distance fraction = the greatest distance moved / viewport height
//
//   CLS = the largest SESSION WINDOW: shifts within 1s of each other, in a
//   window at most 5s long. Not a lifetime sum — that change (2021) stopped
//   long-lived SPAs from being punished forever for one bad shift.

const VIEWPORT_H = 800;

function shiftScore({ affectedHeight, movedBy }) {
  const impact = (affectedHeight + movedBy) / VIEWPORT_H;   // start + end area
  const distance = movedBy / VIEWPORT_H;
  return +(impact * distance).toFixed(4);
}

const shifts = [
  { what: "banner injected above content", affectedHeight: 600, movedBy: 90 },
  { what: "image with no width/height",    affectedHeight: 400, movedBy: 250 },
  { what: "web font swap (FOUT)",          affectedHeight: 300, movedBy: 12 },
];
let cls = 0;
for (const s of shifts) {
  const score = shiftScore(s);
  cls += score;
  console.log(`    ${s.what.padEnd(32)} moved ${String(s.movedBy).padStart(3)}px → score ${score}`);
}
cls = +cls.toFixed(4);
console.log(`    ${"CLS (this session window)".padEnd(32)}${" ".repeat(15)}= ${cls}  → ${rate("CLS", cls)} 🐛`);

// The same page with the standard fixes applied:
const fixed = [
  { what: "banner: space reserved",        affectedHeight: 600, movedBy: 0 },
  { what: "image: width+height set",       affectedHeight: 400, movedBy: 0 },
  { what: "font: size-adjust matched",     affectedHeight: 300, movedBy: 0 },
];
const clsFixed = +fixed.reduce((s, x) => s + shiftScore(x), 0).toFixed(4);
console.log(`\n    after reserving space everywhere: CLS = ${clsFixed} → ${rate("CLS", clsFixed)} ✅`);

console.log("\n  The rule behind every one of those fixes is the same: RESERVE THE");
console.log("  SPACE BEFORE THE CONTENT ARRIVES.");
console.log("    • width and height attributes on every <img> — the browser derives");
console.log("      an aspect ratio from them and reserves the box before download.");
console.log("      Or CSS aspect-ratio. This is the single highest-value CLS fix.");
console.log("    • min-height on ad slots, embeds, and anything injected.");
console.log("    • Fonts: font-display: optional, plus a fallback tuned with");
console.log("      size-adjust / ascent-override so the swap does not reflow.");
console.log("    • Skeletons sized like the real content — which is exactly the");
console.log("      Suspense-fallback rule from 04 §5. A 40px spinner replaced by a");
console.log("      600px table is a layout shift you built on purpose.");
console.log("    • Animate transform and opacity, never top/left/height. Transform");
console.log("      is composited and does not count as a layout shift at all.");
console.log("\n  And the exception worth naming: a shift within 500ms of a user input");
console.log("  is EXPECTED and excluded. Opening an accordion is not penalised. That");
console.log("  is why 'unexpected' is in the metric's definition.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — INP: THE ONE REACT APPS FAIL
// ══════════════════════════════════════════════════════════════════

console.log("§6 — INP, and why it replaced FID:\n");

// FID (retired March 2024) measured only the INPUT DELAY of the FIRST
// interaction — how long before the handler could START. It flattered
// everybody: most sites passed FID while feeling terrible, because the slow
// part is the WORK, not the wait before it.
//
// INP measures the whole thing, for (nearly) EVERY interaction, and reports
// roughly the worst one:
//
//     input delay  +  processing time  +  presentation delay  =  INP
//     ───────────     ───────────────     ─────────────────
//     main thread     your handlers       style, layout, paint —
//     was busy        AND React's         including React's commit
//                     re-render

const interaction = [
  { part: "input delay",       ms: 120, cause: "a long task was still running (bundle parse, analytics)" },
  { part: "processing time",   ms: 260, cause: "🐛 setState → 400 components re-rendered" },
  { part: "presentation delay", ms: 100, cause: "layout + paint of the new DOM" },
];
const inp = interaction.reduce((s, p) => s + p.ms, 0);
for (const p of interaction) {
  console.log(`    ${p.part.padEnd(20)} ${String(p.ms).padStart(4)}ms  ${p.cause}`);
}
console.log(`    ${"INP".padEnd(20)} ${String(inp).padStart(4)}ms  → ${rate("INP", inp)} 🐛`);

// The same interaction after this section's techniques:
const optimized = [
  { part: "input delay",        ms: 30,  cause: "code splitting removed the parse-time long task → 04, 08" },
  { part: "processing time",    ms: 45,  cause: "state moved down + memo → 12 components, not 400 → 01, 03" },
  { part: "presentation delay", ms: 40,  cause: "fewer DOM mutations to lay out" },
];
const inpFixed = optimized.reduce((s, p) => s + p.ms, 0);
console.log(`\n    after the fixes from this section:`);
for (const p of optimized) console.log(`      ${p.part.padEnd(20)} ${String(p.ms).padStart(4)}ms  ${p.cause}`);
console.log(`      ${"INP".padEnd(20)} ${String(inpFixed).padStart(4)}ms  → ${rate("INP", inpFixed)} ✅`);

console.log("\n  This is the payoff line for the whole section. Everything from 01 to");
console.log("  12 lands in the middle row. When someone asks 'why does an unnecessary");
console.log("  re-render matter?', THIS is the answer: 400 components rendering inside");
console.log("  a click handler is 260ms of processing time, and INP is measured");
console.log("  against a 200ms budget for the entire interaction.");

console.log("\n  The React-specific INP toolkit, beyond just rendering less:");
console.log("    • startTransition / useTransition — mark the expensive update");
console.log("      non-urgent so React paints the urgent one (the keystroke) first.");
console.log("      → 02_built-in-hooks/12");
console.log("    • useDeferredValue — same idea, for a value rather than an update.");
console.log("    • YIELD to the main thread inside long handlers: await");
console.log("      scheduler.yield(), or await new Promise(r => setTimeout(r, 0)).");
console.log("      A 300ms task blocks; six 50ms tasks do not.");
console.log("    • Do the visual update FIRST, the bookkeeping after the paint.");
console.log("    • Move genuinely heavy work to a Web Worker.");
console.log("    • Debounce/throttle high-frequency handlers. → 1.2/16, 1.2/17");
console.log("\n  ⚠️ And the one people forget: INP counts the WORST interaction in the");
console.log("  session, not the average. One 900ms modal open ruins a session where");
console.log("  everything else was 40ms. Hunt outliers, not means.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — MEASURING: FIELD vs LAB
// ══════════════════════════════════════════════════════════════════
//
//   FIELD (RUM — real users, real devices, real networks)
//     • Chrome UX Report (CrUX) — 28-day rolling p75 from real Chrome users.
//       This is what Search Console shows and what Google actually assesses.
//     • PageSpeed Insights — shows CrUX field data AND a Lighthouse lab run,
//       side by side. Read the field half first.
//     • the `web-vitals` npm library — YOUR OWN users, with attribution:
//
//         import { onLCP, onCLS, onINP, onFCP, onTTFB } from "web-vitals";
//         const send = ({ name, value, rating, id }) =>
//           navigator.sendBeacon("/vitals", JSON.stringify({ name, value, rating, id }));
//         onLCP(send); onCLS(send); onINP(send); onFCP(send); onTTFB(send);
//
//       Use web-vitals/attribution instead and each report carries the CULPRIT
//       — the LCP element's selector, the largest shift's source element, the
//       INP interaction's target and its longest sub-part. That turns "INP is
//       480ms" into "INP is 480ms on button.add-to-cart, mostly processing".
//       Next.js exposes the same thing via useReportWebVitals.
//
//   LAB (synthetic — one simulated device, no user)
//     • Lighthouse / lighthouse-ci — reproducible, good for CI regression gates.
//     • WebPageTest — filmstrips, real devices, real networks.
//
//   THE LIMIT THAT MATTERS: a lab tool has no user, so it CANNOT measure INP,
//   and it only sees layout shifts that happen during its short run. Lighthouse
//   substitutes TBT as an INP proxy. So:
//
//     Lighthouse 100 + failing field CLS  → completely normal, and not a bug.
//     "We fixed it, the score is green"   → check CrUX in 28 days.
//
//   Say it as: "Lab data finds problems, field data proves them. I gate CI on
//   Lighthouse and I judge success on CrUX p75."

console.log("§7 — what each tool can and cannot see:\n");
const tools = [
  ["Lighthouse (lab)",   "LCP ✅  CLS ~partial  INP ❌ (TBT proxy)", "CI gates, catching regressions"],
  ["CrUX / PSI (field)", "LCP ✅  CLS ✅        INP ✅",            "the number you are judged on"],
  ["web-vitals + attribution", "LCP ✅  CLS ✅   INP ✅ + culprit",  "your own RUM, per release"],
];
for (const [tool, coverage, use] of tools) {
  console.log(`    ${tool.padEnd(26)} ${coverage.padEnd(40)} ${use}`);
}
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE REACT MAP
// ══════════════════════════════════════════════════════════════════
//
// The table to have ready. It is the answer to "how does your React work relate
// to Web Vitals?", and it makes this whole section cohere.
//
//   VITAL   React causes                          Fixes in this section
//   ─────   ───────────────────────────────────   ─────────────────────────────
//   LCP     a huge bundle delaying hydration;     code splitting (04, 05, 06),
//           the hero rendered by client JS         bundle analysis (08), SSR (14),
//                                                  streaming (15)
//   CLS     Suspense fallbacks smaller than the   size your fallbacks (04 §5),
//           content; content injected after       reserve space, aspect-ratio
//           hydration; conditional UI
//   INP     re-rendering hundreds of components   memo (01), stable props (02),
//           inside an event handler; long tasks   move state down (03),
//                                                  virtualize (07), transitions
//   FCP     render-blocking JS/CSS; a client-     split (04), SSR/streaming
//           only shell with nothing to paint      (14, 15)
//   TTFB    slow SSR, no caching, cold starts     caching, edge, streaming (15)
//
// And the one-line strategy:
//   A React SPA usually fails LCP and INP and passes CLS. Server rendering fixes
//   LCP; rendering less fixes INP. Everything in 01-12 is the second half.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Lighthouse 100, users complain it feels slow:
//   Lab data can't measure INP. Check CrUX. → §7.
//
// Bug 2 — loading="lazy" on the hero image:
//   The one image that defines LCP, deliberately delayed. → §4.
//
// Bug 3 — CLS is fine locally, terrible in the field:
//   Your images are cached and your fonts are warm. Test cold, on 4G. → §5.
//
// Bug 4 — INP fine in dev, awful in production:
//   Real devices are ~4× slower, and your dev machine has no ads or
//   third-party scripts competing for the main thread. → 11 §6.
//
// Bug 5 — A spinner replaced by a full table:
//   A designed-in layout shift. Size the fallback. → §5, 04 §5.
//
// Bug 6 — "We improved the average by 30%" and the metric didn't move:
//   Assessment is p75, and INP takes the worst interaction. Hunt the tail. → §3.
//
// Bug 7 — A font swap moves every paragraph:
//   font-display: swap with a mismatched fallback. Use optional plus
//   size-adjust. → §5.
//
// Bug 8 — INP regressed after adding analytics:
//   A third-party script's long tasks became your input delay. → §6.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Thresholds:
assert(rate("LCP", 2400) === "good" && rate("LCP", 2600) === "needs-improvement",
  "LCP's good threshold is 2.5s");
assert(rate("INP", 200) === "good" && rate("INP", 201) === "needs-improvement",
  "INP's good threshold is 200ms");
assert(rate("CLS", 0.1) === "good" && rate("CLS", 0.3) === "poor",
  "CLS: 0.1 good, above 0.25 poor");
assert(VITALS.filter(v => v.core).length === 3,
  "there are exactly THREE Core Web Vitals: LCP, INP, CLS. FCP and TTFB are diagnostics");

// LCP:
assert(lcpTotal === 3100 && rate("LCP", lcpTotal) === "needs-improvement",
  "the four sub-parts sum to 3100ms");
assert(lcpParts[1].ms + lcpParts[2].ms === 2000,
  "2000ms of it is the image being discovered late and downloaded slowly — " +
  "so preload and compression are the fixes, not the server 🐛");

// CLS:
assert(shiftScore({ affectedHeight: 600, movedBy: 90 }) === 0.097,
  "impact ((600+90)/800) × distance (90/800) = 0.097");
assert(cls > 0.25 && rate("CLS", cls) === "poor", "three shifts compound to a poor CLS 🐛");
assert(clsFixed === 0 && rate("CLS", clsFixed) === "good",
  "reserving space removes it entirely — CLS is the most FIXABLE vital ✅");

// INP:
assert(inp === 480 && rate("INP", inp) === "needs-improvement", "480ms INP");
assert(interaction[1].ms > interaction[0].ms + interaction[2].ms,
  "processing time — YOUR handlers plus React's re-render — is the biggest slice 🐛");
assert(inpFixed === 115 && rate("INP", inpFixed) === "good",
  "this section's techniques take it to 115ms ✅");
assert(inp - inpFixed === 365, "365ms saved, and 215ms of it was rendering fewer components");

console.log("§10 — mini assertions passed for: Web Vitals (LCP, FCP, CLS, INP)");
console.log("\n  The pair that captures it: the biggest slice of a 480ms INP was 260ms");
console.log("  of processing — 400 components re-rendering inside a click handler.");
console.log("  That is what every technique in this section was actually buying.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are Core Web Vitals?", answer:
//
//   "Three user-centric metrics: LCP for loading — when the largest element in
//    the viewport paints, good is under 2.5 seconds. CLS for visual stability —
//    unexpected layout shift, good is under 0.1. And INP for responsiveness —
//    interaction to next paint, good is under 200 milliseconds. FCP and TTFB are
//    diagnostics that help you explain LCP, not Core Vitals themselves.
//
//    Two things about the measurement matter as much as the definitions. It's
//    assessed at the 75th percentile of real users, not the average — so a quarter
//    of your users can be worse than the number you're judged on, which is
//    deliberate, because averages hide the tail. And it's field data, from Chrome
//    UX Report, not a lab run.
//
//    INP replaced FID in March 2024, and that's the change worth knowing. FID
//    measured only the delay before the first handler could start, so almost
//    everyone passed it while their sites still felt awful — the slow part is the
//    work, not the wait. INP measures the whole interaction, for essentially every
//    interaction, and reports roughly the worst one: input delay, processing time,
//    and presentation delay.
//
//    That middle part is where React lives. A click that setStates and re-renders
//    four hundred components is processing time, and the entire budget for the
//    interaction is 200ms. So this is where I'd connect it: everything people
//    call 'React performance' — memo, stable props, moving state down,
//    virtualizing lists, transitions — is INP work. If I can't say which vital a
//    memo moved, I probably shouldn't have written it.
//
//    LCP in a React app is usually a bundle problem: the hero element is rendered
//    by JavaScript, so it can't paint until the bundle downloads, parses and
//    hydrates. Code splitting, bundle analysis and server rendering are the fixes.
//    And the most common own-goal is a blanket loading='lazy' rule that also lazy
//    loads the LCP image.
//
//    CLS is the most fixable of the three, and it's one rule: reserve the space
//    before the content arrives. Width and height on images, min-height on ad and
//    embed slots, fonts with size-adjust, and Suspense fallbacks sized like the
//    real content — a 40px spinner replaced by a 600px table is a layout shift
//    you built on purpose.
//
//    For measurement I'd use both kinds: Lighthouse in CI to catch regressions,
//    knowing it can't measure INP at all and substitutes Total Blocking Time, and
//    the web-vitals library with attribution for real users — because attribution
//    turns 'INP is 480ms' into 'INP is 480ms on the add-to-cart button, mostly
//    processing time'. Lab data finds problems; field data proves them."
//
// The FID→INP story, the p75 rule, and mapping React techniques onto INP are the
// three things that make this a senior answer rather than a recited table.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Name the Core Web Vitals and their thresholds.
// A1. LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 — at p75 of real users.
//
// Q2. What replaced FID, and why?
// A2. INP, in March 2024. FID measured only the delay before the first handler
//     ran, so nearly everyone passed while still feeling slow.
//
// Q3. What are INP's three parts?
// A3. Input delay, processing time, presentation delay.
//
// Q4. How is CLS calculated?
// A4. impact fraction × distance fraction per shift, summed within the worst
//     1s/5s session window. Shifts within 500ms of an input are excluded.
//
// Q5. Why can't Lighthouse measure INP?
// A5. There's no user interacting. It reports Total Blocking Time as a proxy.
//
// Q6. Why p75 and not the average?
// A6. Averages hide the tail, and the tail is who complains. p75 means most
//     users have at least that experience.
//
// Q7. Which vital do React apps usually fail?
// A7. INP, from re-rendering too much inside handlers — and LCP, from a heavy
//     client bundle.
//
// Q8. Biggest LCP win in a React app?
// A8. Server-render the LCP element and preload it with fetchpriority=high;
//     never lazy-load an above-the-fold image.
//
// Q9. Biggest CLS win?
// A9. Dimensions on every image, and sizing skeletons like the real content.
//
// Q10. How do you measure on real users?
// A10. The web-vitals library with attribution, beaconed to your own endpoint,
//      plus CrUX for the assessed number.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The three Core Web Vitals?
//   Back : LCP (load), CLS (stability), INP (response).
//
// Flashcard 2:
//   Front: Thresholds?
//   Back : LCP 2.5s, INP 200ms, CLS 0.1 — at p75.
//
// Flashcard 3:
//   Front: FID → INP: what changed?
//   Back : INP measures the whole interaction, on all of them, not just the
//          delay before the first one.
//
// Flashcard 4:
//   Front: INP's parts?
//   Back : Input delay + processing time + presentation delay.
//
// Flashcard 5:
//   Front: CLS formula?
//   Back : impact fraction × distance fraction, worst session window.
//
// Flashcard 6:
//   Front: Why is Lighthouse green but the field data red?
//   Back : Lab has no user — it can't measure INP or long-run CLS.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Tie React render work to INP's processing time, and quote p75
//          rather than averages.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Run PageSpeed Insights on a real site. Read the FIELD section first, then
//   the lab section, and note where they disagree.
//
// Task 2:
//   Add the web-vitals library with attribution and log all five metrics.
//   Identify your own LCP element from the attribution data.
//
// Task 3:
//   Remove width/height from an image and measure CLS. Add them back. Compute
//   the score by hand with §5's formula and check it matches.
//
// Task 4:
//   Build a button whose handler re-renders 500 components. Measure INP in the
//   Performance panel. Then wrap the update in startTransition and re-measure.
//
// Task 5:
//   Add loading="lazy" to your hero image and watch LCP get worse. Then add
//   fetchpriority="high" and watch it get better.
//
// Task 6:
//   Set a Lighthouse CI budget for LCP and CLS and make it fail a PR.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 — at the 75th percentile of REAL users.
//
// If you remember the common bug:
//   A green Lighthouse score proves nothing about INP, because a lab run has no
//   user to interact.
//
// If you remember the professional framing:
//   INP's processing time is where React render work shows up — that is the
//   business case for every technique in this section. And CLS is one rule:
//   reserve the space before the content arrives.
//
// NEXT TOPIC -> 14_hydration-performance.js
