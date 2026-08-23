// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  07_virtualization-react-window.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Virtualization (react-window)
//
// WHAT YOU WILL MASTER HERE:
//   1. Why 10,000 rows is a DOM problem, not a React problem
//   2. A WORKING virtualizer in ~15 lines — the whole idea is one range
//   3. Overscan: what it buys, and the cost of getting it wrong
//   4. Fixed vs variable heights, and why variable is genuinely hard
//   5. The five bugs everyone hits: no height, keys, Ctrl+F, a11y, jumpy scroll
//   6. When virtualization is the WRONG answer
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/07_virtualization-react-window.js"
//
// Prerequisites: 01 (memo — a virtualized row is the canonical memo case) and
// 03 (the render/commit split). This is the last rung of 03's ladder, and the
// only one that scales past ~1,000 items.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Virtualization (windowing):
// Render only the rows currently inside the scroll viewport (plus a small
// buffer), and fake the rest with spacing — so the DOM holds ~20 nodes instead
// of 10,000, no matter how long the list is.
//
// If interviewer says "explain it simply", say:
// "A screen shows maybe fifteen rows. If the list has ten thousand, the other
//  9,985 are invisible — but they're still real DOM nodes the browser has to
//  create, lay out, style and keep in memory. Virtualization renders only what's
//  on screen and uses a tall empty container so the scrollbar still behaves."
//
// If interviewer asks "why does it matter?", say:
// "Because this is the one performance problem memo can't touch. memo skips a
//  re-render; it doesn't stop the initial mount of ten thousand components or
//  the browser's layout of ten thousand elements. Virtualization changes the
//  complexity — the work becomes proportional to the VIEWPORT, not the data. A
//  list of 10 and a list of 1,000,000 cost the same to scroll."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   Cost ∝ VIEWPORT, not data
//
// Runtime rule:
//   scrollTop tells you where you are. Divide by row height and you know which
//   index is at the top. That is the entire algorithm — everything else is
//   bookkeeping.
//
//     startIndex = floor(scrollTop / itemSize)
//     visible    = ceil(viewportHeight / itemSize)
//     endIndex   = startIndex + visible
//
// Practical rule:
//   Reach for it above roughly 100-200 rows, or any row with real content
//   (avatars, buttons, charts). Below that it is complexity you do not need.
//
// Common trap:
//   The list renders nothing. react-window needs an EXPLICIT height and width —
//   it cannot compute a window without knowing the viewport. A parent with no
//   height gives you height={0}, which means zero visible rows.
//
// The picture:
//
//   real DOM (10,000 rows)          virtualized (16 rows)
//   ┌──────────────┐                ┌──────────────┐
//   │ row 0        │ ← visible      │ spacer: 4200px (top offset)
//   │ ...          │                ├──────────────┤
//   │ row 14       │ ← visible      │ row 140..155 │ ← the only real nodes
//   ├──────────────┤                ├──────────────┤
//   │ row 15       │ 🐛 in the DOM  │ spacer: rest of the height
//   │ ... 9,985 …  │ 🐛 invisible   └──────────────┘
//   └──────────────┘                total height identical → scrollbar identical


// ══════════════════════════════════════════════════════════════════
// § 3 — THE COST OF NOT DOING IT
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what 10,000 rows actually costs:\n");

const TOTAL = 10000;
const NODES_PER_ROW = 6;          // <div><img><span><span><button><span>
const BYTES_PER_NODE = 1200;      // rough browser cost of an element + styles
const LAYOUT_US_PER_NODE = 3;     // layout+style, microseconds, mid-range device

function cost(rowsRendered) {
  const nodes = rowsRendered * NODES_PER_ROW;
  return {
    rows: rowsRendered,
    domNodes: nodes,
    memoryMB: +(nodes * BYTES_PER_NODE / 1024 / 1024).toFixed(1),
    layoutMs: Math.round(nodes * LAYOUT_US_PER_NODE / 1000),
    componentCalls: rowsRendered,
  };
}

const VIEWPORT_H = 600, ROW_H = 40, OVERSCAN = 3;
const visibleRows = Math.ceil(VIEWPORT_H / ROW_H) + OVERSCAN * 2;

const naive = cost(TOTAL);
const windowed = cost(visibleRows);

console.log("    naive  :", JSON.stringify(naive));
console.log("    windowed:", JSON.stringify(windowed));
console.log("\n    DOM nodes  :", naive.domNodes, "→", windowed.domNodes,
  `(${Math.round(naive.domNodes / windowed.domNodes)}× fewer)`);
console.log("    memory     : ~" + naive.memoryMB + "MB → ~" + windowed.memoryMB + "MB");
console.log("    layout+style: ~" + naive.layoutMs + "ms → ~" + windowed.layoutMs + "ms");

console.log("\n  Note which columns changed. The React work (10,000 component calls)");
console.log("  is the SMALLER half of that bill. The bigger half is browser work:");
console.log("  creating 60,000 elements, computing styles for all of them, laying");
console.log("  them out, and holding them in memory. That is why memo cannot help");
console.log("  here — memo prevents RE-renders, and this cost is paid on the FIRST");
console.log("  one. Virtualization is the only tool that removes it.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — A WORKING VIRTUALIZER
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the whole algorithm:\n");

function getVisibleRange({ scrollTop, viewportHeight, itemSize, itemCount, overscan = 0 }) {
  const first = Math.floor(scrollTop / itemSize);
  const visible = Math.ceil(viewportHeight / itemSize);
  const start = Math.max(0, first - overscan);
  const end = Math.min(itemCount - 1, first + visible + overscan);
  return {
    start,
    end,
    count: end - start + 1,
    offsetTop: start * itemSize,           // ← the top spacer / translateY
    totalHeight: itemCount * itemSize,     // ← keeps the scrollbar honest
  };
}

const positions = [0, 4000, 399600];
for (const scrollTop of positions) {
  const r = getVisibleRange({
    scrollTop, viewportHeight: VIEWPORT_H, itemSize: ROW_H,
    itemCount: TOTAL, overscan: OVERSCAN,
  });
  console.log(`    scrollTop ${String(scrollTop).padStart(6)} → rows ${String(r.start).padStart(5)}..${String(r.end).padStart(5)}` +
    `  (${r.count} rendered)  offsetTop ${r.offsetTop}  totalHeight ${r.totalHeight}`);
}

console.log("\n  Two invariants make the illusion perfect:");
console.log("    1. totalHeight is always itemCount × itemSize, so the scrollbar is");
console.log("       exactly the size and position it would be with every row present.");
console.log("    2. The rendered block is pushed down by offsetTop — with a top");
console.log("       padding, or transform: translateY(offsetTop), or absolute");
console.log("       positioning per row. transform is the fastest: it is");
console.log("       compositor-only, so scrolling never triggers layout.");
console.log("\n  Everything else react-window does is variations on those two lines.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — OVERSCAN
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the buffer, priced:\n");

// Rows just outside the viewport, rendered in advance. Without it, a fast scroll
// shows blank space for the frame between "scroll event" and "React committed
// the new rows". With too much of it you are back to rendering the whole list.

function scrollCost(overscan) {
  const perFrame = Math.ceil(VIEWPORT_H / ROW_H) + overscan * 2;
  // A fast flick moves ~1200px/frame. Rows that scroll in beyond the buffer
  // arrive as blank space for one frame.
  const rowsPerFrame = Math.ceil(1200 / ROW_H);
  const blankRows = Math.max(0, rowsPerFrame - (Math.ceil(VIEWPORT_H / ROW_H) + overscan));
  return { rendered: perFrame, blankRowsOnFlick: blankRows };
}

for (const o of [0, 3, 10, 200]) {
  const c = scrollCost(o);
  const verdict = o === 0 ? "🐛 blank flashes on fast scroll"
    : o <= 10 ? "✅"
    : "🐛 you are re-rendering half the list";
  console.log(`    overscan ${String(o).padStart(3)} → ${String(c.rendered).padStart(3)} rows rendered, ` +
    `${c.blankRowsOnFlick} blank rows on a fast flick  ${verdict}`);
}
console.log("\n  Sensible defaults: 2-5 rows for a simple list, more if each row is");
console.log("  cheap, fewer if each row is expensive. react-window's default is 2.");
console.log("  Tune it by scrolling fast on a throttled CPU, not by guessing.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — react-window, THE ACTUAL API
// ══════════════════════════════════════════════════════════════════
//
//   import { FixedSizeList as List } from "react-window";
//
//   const Row = React.memo(({ index, style, data }) => (
//     <div style={style}>{data[index].name}</div>
//   ));
//
//   <List
//     height={600}          // viewport height  — REQUIRED, in px
//     width="100%"          // viewport width   — REQUIRED
//     itemCount={items.length}
//     itemSize={40}         // row height in px
//     itemData={items}      // ← passed to every row as `data`
//     overscanCount={3}
//     itemKey={(i, data) => data[i].id}   // ← stable keys. Do this.
//   >
//     {Row}
//   </List>
//
// The rules that trip people up, in order of how often they do:
//
//   1. `style` MUST be spread onto the row's outermost element. It carries the
//      absolute position. Drop it and every row stacks at the top — the single
//      most common react-window bug.
//   2. height and width are required and must be real numbers of pixels for
//      height. In a flex/auto-height parent, use AutoSizer
//      (react-virtualized-auto-sizer) or a ResizeObserver.
//   3. Pass data through `itemData`, not a closure, so the row can be memoized.
//      An inline `{({index}) => <Row item={items[index]}/>}` recreates the row
//      component every render. → 05 §6, same bug family.
//   4. `itemKey` — without it the key is the INDEX, and index keys break on
//      sort, filter and delete exactly as they do in any list. → 2A.1/05.
//   5. Memoize the row. On scroll, the whole list re-renders; memo means only
//      the rows that actually entered or left the window do work. → 01.
//
// The family:
//   FixedSizeList / FixedSizeGrid       — every item the same size. Easy, fast.
//   VariableSizeList / VariableSizeGrid — itemSize is a function of index; you
//                                         must call resetAfterIndex(i) when a
//                                         size changes, or the offsets go stale.
//
// The current landscape, worth naming:
//   • react-window — small (~2KB), fixed/variable, the classic answer.
//   • @tanstack/react-virtual — headless: it gives you the range and offsets,
//     you render the markup. Best fit for custom layouts, and it measures
//     dynamic heights properly.
//   • react-virtuoso — batteries-included: auto-measures unknown heights,
//     sticky headers, grouping. Bigger, but it solves §7 for you.
//   • CSS `content-visibility: auto` + `contain-intrinsic-size` — no JS at all.
//     It skips rendering off-screen subtrees. Great for long articles and
//     moderate lists; it does not fix memory or mount cost the way windowing
//     does, because the elements still exist.

console.log("§6 — the `style` prop, and why forgetting it stacks every row:\n");

const range = getVisibleRange({
  scrollTop: 4000, viewportHeight: VIEWPORT_H, itemSize: ROW_H,
  itemCount: TOTAL, overscan: 0,
});
const withStyle = [];
for (let i = range.start; i <= range.start + 2; i++) {
  withStyle.push({ index: i, style: { position: "absolute", top: i * ROW_H, height: ROW_H } });
}
console.log("    rows react-window hands you:");
withStyle.forEach(r => console.log(`      index ${r.index} → style.top = ${r.style.top}px`));
console.log("    drop `style` → every row renders at top: 0, all stacked. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — VARIABLE HEIGHTS: WHY IT IS HARD
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the chicken-and-egg problem:\n");

// With fixed rows, offset(i) = i × itemSize — O(1), exact, known before render.
// With variable rows you need offset(i) = sum of heights 0..i-1, and you cannot
// know a row's height until it has RENDERED. So:
//
//   to place row 500 you need the heights of rows 0-499
//   → but you only render ~15 rows
//   → so you have never measured rows 0-499
//
// The three answers, in increasing order of honesty:
//
//   1. DECLARE the sizes: VariableSizeList's itemSize={i => sizes[i]}. Works
//      when you know them (a fixed schema, a header row, an expanded row). You
//      must call listRef.current.resetAfterIndex(i) whenever a size changes —
//      forgetting this is the classic "rows overlap after expanding one" bug.
//   2. ESTIMATE, then MEASURE and CORRECT: guess an average, render, measure the
//      real height with a ResizeObserver, cache it, and adjust total height and
//      offsets. This is what @tanstack/react-virtual and react-virtuoso do.
//   3. Make the rows fixed. Truncate the text, cap the height. Genuinely the
//      right answer more often than people admit.

function estimateThenMeasure({ itemCount, estimate, realHeights, measuredUpTo }) {
  let total = 0;
  for (let i = 0; i < itemCount; i++) {
    total += i < measuredUpTo ? realHeights[i] : estimate;   // measured, else guessed
  }
  return total;
}

const realHeights = Array.from({ length: 1000 }, (_, i) => 40 + (i % 5) * 20);  // 40..120
const trueTotal = realHeights.reduce((a, b) => a + b, 0);
const estimates = [0, 50, 300, 1000].map(measuredUpTo => ({
  measuredUpTo,
  estimated: estimateThenMeasure({ itemCount: 1000, estimate: 60, realHeights, measuredUpTo }),
}));

console.log("    true total height:", trueTotal + "px");
for (const e of estimates) {
  const errPct = Math.round(Math.abs(e.estimated - trueTotal) / trueTotal * 100);
  console.log(`      after measuring ${String(e.measuredUpTo).padStart(4)} rows → estimate ${String(e.estimated).padStart(6)}px  (off by ${errPct}%)`);
}

console.log("\n  That error is VISIBLE: the scrollbar thumb resizes as you scroll, and");
console.log("  scroll position can jump when a correction lands. Mitigations that");
console.log("  actually work: estimate from real data rather than a constant, anchor");
console.log("  scroll to a known item instead of a pixel offset, and prefer");
console.log("  `overflow-anchor` / scroll anchoring where the browser gives it to you.");
console.log("\n  The senior line: 'variable heights are solvable but not free — I'd");
console.log("  ask first whether the rows can be fixed, because a fixed list has no");
console.log("  measurement pass, no cache invalidation and no scroll drift at all.'\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT VIRTUALIZATION COSTS YOU
// ══════════════════════════════════════════════════════════════════
//
// Bring these up unprompted. They are the reason "just virtualize it" is not
// always the right advice.
//
//   • Ctrl+F IS BROKEN. Browser find-in-page only searches the DOM, and 9,985
//     rows are not in it. So is the browser's "highlight all". If users search
//     the list, you must give them your own search UI.
//   • ACCESSIBILITY needs work. A screen reader sees 15 of 10,000 rows. You need
//     the right roles and, critically, aria-setsize and aria-posinset so assistive
//     tech can announce "item 140 of 10,000". Most naive implementations skip it.
//   • SEO: virtualized content is not in the initial HTML. Fine for an app
//     behind a login; wrong for a public product listing.
//   • CTRL+HOME / anchor links / "scroll to item" need an API call
//     (scrollToItem), not an element reference — the element does not exist.
//   • PRINTING gives you 15 rows.
//   • Sticky headers, row grouping, expanding rows, drag-and-drop reordering and
//     horizontal+vertical scroll all get materially harder.
//   • Testing: your test renders 15 rows. `getByText("row 9000")` fails, and
//     that surprises people the first time.
//
// SO: WHEN IS IT THE WRONG ANSWER?
//
//   • The list is 50 items. You added a dependency and three bugs for nothing.
//   • The real problem is that you FETCHED 10,000 rows. Paginate or use
//     server-side search — you also saved the payload, the JSON parse and the
//     memory. Virtualizing a huge fetch is treating the symptom.
//   • Each row is heavy and the count is moderate → memo the rows first. → 01
//   • You need find-in-page and public SEO → pagination.
//   • The content is a long document, not a list → `content-visibility: auto` is
//     one CSS line and keeps everything in the DOM.
//
// The honest ladder for "my long list is slow":
//   1. Are you fetching more than you show? Paginate.           ← usually this
//   2. Is each row expensive? memo it and stabilize props.      → 01, 02
//   3. Still slow above ~200 rows? Virtualize.                  ← this file
//   4. Long prose rather than rows? content-visibility: auto.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Nothing renders:
//   height={0} — the parent has no explicit height. Use AutoSizer. → §6.2.
//
// Bug 2 — Every row is stacked on top of the first:
//   You did not spread `style` onto the row element. → §6.1. THE bug.
//
// Bug 3 — Rows overlap / wrong offsets after a row expands:
//   VariableSizeList without resetAfterIndex(index). → §7.
//
// Bug 4 — Blank flashes while scrolling fast:
//   overscanCount is 0, or each row is too expensive to render in a frame.
//   Raise overscan, then memo the row. → §5.
//
// Bug 5 — Checkbox state jumps to the wrong row after sorting:
//   Index keys. Pass itemKey. Identical to any list-key bug. → §6.4.
//
// Bug 6 — Scrolling is janky even though only 15 rows render:
//   The rows re-render on every scroll because itemData is a new array/object
//   each render, or the row is defined inline. → 01, 02.
//
// Bug 7 — "Users say search doesn't work":
//   They mean Ctrl+F. It cannot work. → §8.
//
// Bug 8 — Tests fail to find row 9000:
//   It is not in the DOM. Assert on the rendered window, or scroll first.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The cost:
assert(naive.domNodes === 60000, "10,000 rows × 6 nodes = 60,000 DOM nodes 🐛");
assert(windowed.rows === 21, "600px viewport / 40px rows + 3 overscan each side = 21 rows");
assert(windowed.domNodes === 126, "...which is 126 nodes ✅");
assert(Math.round(naive.domNodes / windowed.domNodes) === 476, "476× fewer nodes");

// The algorithm:
const top = getVisibleRange({ scrollTop: 0, viewportHeight: 600, itemSize: 40, itemCount: 10000, overscan: 3 });
assert(top.start === 0, "at scrollTop 0 the range starts at 0 — clamped, not negative");
assert(top.offsetTop === 0 && top.totalHeight === 400000,
  "totalHeight is always itemCount × itemSize — that is what keeps the scrollbar honest");

const mid = getVisibleRange({ scrollTop: 4000, viewportHeight: 600, itemSize: 40, itemCount: 10000, overscan: 3 });
assert(mid.start === 97 && mid.end === 118,
  "scrollTop 4000 / 40 = row 100, minus 3 overscan = 97; 100+15+3 = 118");
assert(mid.offsetTop === 3880, "the rendered block is pushed down by start × itemSize");

const bottom = getVisibleRange({ scrollTop: 399600, viewportHeight: 600, itemSize: 40, itemCount: 10000, overscan: 3 });
assert(bottom.end === 9999, "the end index is clamped to the last row — never past it");

// Overscan:
assert(scrollCost(0).blankRowsOnFlick === 15,
  "with no overscan, a fast flick outruns the render → blank rows 🐛");
assert(scrollCost(10).rendered === 35, "overscan 10 → 35 rows rendered, still trivial ✅");
assert(scrollCost(200).rendered === 415, "overscan 200 → you have un-virtualized the list 🐛");

// Variable heights:
assert(estimates[0].estimated === 60000, "with nothing measured, the estimate is count × guess");
assert(estimates[3].estimated === trueTotal,
  "once every row is measured, the total is exact — but you only get there by scrolling everywhere");
assert(estimates[0].estimated !== trueTotal,
  "until then the scrollbar is lying, and corrections make the thumb jump 🐛");

console.log("§10 — mini assertions passed for: Virtualization (react-window)");
console.log("\n  The pair that captures it: 60,000 DOM nodes became 126 — a 476×");
console.log("  reduction that no amount of memo could produce — and the whole");
console.log("  algorithm was floor(scrollTop / itemSize) plus a clamp.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how would you render a list of 10,000 items?", answer:
//
//   "First I'd ask why 10,000 items are on the client at all — if it's a fetch
//    that returns everything, pagination or server-side search fixes the
//    payload, the parse, the memory and the render in one move. Virtualizing a
//    huge fetch is treating the symptom.
//
//    If they genuinely all need to be scrollable, virtualization. The screen
//    shows about fifteen rows, so I render fifteen plus a small buffer and fake
//    the rest with height. Two invariants make it invisible to the user: the
//    container's total height is always itemCount times itemSize, so the
//    scrollbar is exactly right, and the rendered block is offset by
//    startIndex times itemSize — ideally with a transform, since that's
//    compositor-only and never triggers layout.
//
//    The algorithm is three lines: floor(scrollTop / itemSize) is the first
//    index, ceil(viewportHeight / itemSize) is how many fit, and you clamp both
//    ends. Libraries handle the bookkeeping — react-window for fixed rows,
//    TanStack Virtual if I want headless control and real dynamic measurement.
//
//    What matters is that this is the one problem memo can't solve. memo skips
//    re-renders; it doesn't stop the initial mount of ten thousand components or
//    the browser laying out sixty thousand elements. In my example that was
//    60,000 nodes down to 126.
//
//    In practice the bugs are always the same few: the parent has no explicit
//    height so nothing renders, or you forget to spread the `style` prop onto
//    the row so they all stack at the top. And you still want memo on the row
//    plus itemData rather than a closure, because the list re-renders on every
//    scroll — memo makes only the rows that entered or left the window do work.
//
//    The trade-offs I'd flag before choosing it: Ctrl+F stops working, since
//    find-in-page only searches the DOM; accessibility needs aria-setsize and
//    aria-posinset so a screen reader can say 'item 140 of 10,000'; the content
//    isn't in the HTML for SEO; and scroll-to-item becomes an API call rather
//    than an element reference. For a long article rather than a list I'd reach
//    for content-visibility: auto instead — one CSS line, and everything stays
//    in the DOM."
//
// Asking "why are there 10,000 items?" first, and volunteering the Ctrl+F and
// a11y costs, is what separates this from a memorized definition.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is virtualization?
// A1. Rendering only the rows in the viewport plus a buffer, with a spacer that
//     preserves total scroll height.
//
// Q2. Why can't memo solve this?
// A2. memo prevents re-renders. The cost here is the first mount and the
//     browser's layout of tens of thousands of elements.
//
// Q3. The core formula?
// A3. start = floor(scrollTop / itemSize); count = ceil(viewportHeight /
//     itemSize); clamp both ends; offset by start × itemSize.
//
// Q4. What's overscan for?
// A4. Rendering slightly outside the viewport so a fast scroll doesn't show
//     blank space for a frame. 2-5 rows is typical.
//
// Q5. Why does react-window require height and width?
// A5. It can't compute a window without knowing the viewport. Use AutoSizer in
//     a flexible layout.
//
// Q6. Why are all my rows stacked at the top?
// A6. You didn't spread the `style` prop — it carries the absolute position.
//
// Q7. How do variable heights work?
// A7. Either you declare sizes (and call resetAfterIndex when they change) or
//     the library estimates, measures with a ResizeObserver, caches, and
//     corrects — which is why the scrollbar can drift.
//
// Q8. What breaks when you virtualize?
// A8. Ctrl+F, screen-reader counts unless you add aria-setsize/posinset, SEO,
//     printing, anchor links, and simple tests.
//
// Q9. When would you NOT virtualize?
// A9. Small lists, when pagination is the real fix, or long prose where
//     content-visibility: auto is a one-line answer.
//
// Q10. Do you still need memo on rows?
// A10. Yes. The list re-renders on scroll; memo limits work to the rows that
//      actually entered or left the window.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does virtualization change?
//   Back : Cost becomes proportional to the viewport, not the data.
//
// Flashcard 2:
//   Front: The formula?
//   Back : start = floor(scrollTop / itemSize); count = ceil(height / itemSize).
//
// Flashcard 3:
//   Front: Two invariants that keep the illusion?
//   Back : totalHeight = count × size, and offset the block by start × size.
//
// Flashcard 4:
//   Front: Rows all stacked at the top — why?
//   Back : You didn't spread the `style` prop onto the row.
//
// Flashcard 5:
//   Front: Why are variable heights hard?
//   Back : You need heights to place rows, and can't measure a row you haven't
//          rendered. Estimate → measure → correct.
//
// Flashcard 6:
//   Front: What breaks for users?
//   Back : Ctrl+F, screen-reader counts, SEO, printing.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Ask why 10,000 items are on the client, and name the Ctrl+F and
//          a11y costs before adopting it.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Render 10,000 plain <div>s. Open the Elements panel and the Performance
//   tab. Record the mount. Look at the memory number.
//
// Task 2:
//   Write §4's getVisibleRange from memory, including both clamps. Test it at
//   scrollTop 0 and at the very bottom.
//
// Task 3:
//   Install react-window, virtualize the list, and re-record. Compare node
//   counts and mount time.
//
// Task 4:
//   Deliberately forget the `style` prop. See the stack. Then set
//   overscanCount to 0 and flick-scroll on 6× CPU throttling.
//
// Task 5:
//   Make the rows variable height with VariableSizeList. Expand one row without
//   calling resetAfterIndex and watch the offsets go wrong.
//
// Task 6:
//   Try to Ctrl+F for a row far down the list. Then add aria-setsize and
//   aria-posinset and check with a screen reader.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Render the viewport, fake the rest. Cost becomes proportional to the screen,
//   not the data.
//
// If you remember the common bug:
//   No explicit height renders nothing; a missing `style` prop stacks every row
//   at the top.
//
// If you remember the professional framing:
//   Ask why 10,000 rows reached the client before virtualizing anything — and
//   name what it costs: Ctrl+F, screen-reader counts, SEO and printing.
//
// NEXT TOPIC -> 08_bundle-size-analysis.js
