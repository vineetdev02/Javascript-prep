// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Optimization Techniques — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.4 — Performance.
// It follows 2A.3 (State Management) and precedes 2A.5 (Patterns & Architecture).
//
// Folder:
//   learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/
//
// Files:
// ├── index.js
// ├── 01_react-memo-when-to-use.js
// ├── 02_referential-equality-problem.js
// ├── 03_avoiding-unnecessary-re-renders.js
// ├── 04_code-splitting-lazy-suspense.js
// ├── 05_react-lazy.js
// ├── 06_dynamic-import.js
// ├── 07_virtualization-react-window.js
// ├── 08_bundle-size-analysis.js
// ├── 09_shouldcomponentupdate.js
// ├── 10_purecomponent.js
// ├── 11_profiler-api.js
// ├── 12_why-did-you-render.js
// ├── 13_web-vitals-lcp-fcp-cls-inp.js
// ├── 14_hydration-performance.js
// ├── 15_suspense-and-streaming.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// READ IN ORDER:
//   This section has three movements and they build. 01-03 make RENDERING
//   cheaper. 04-08 make the app SMALLER. 09-12 are how you measure, and 13-15
//   are how you justify it to someone who does not write React. Reading 07
//   first will teach you react-window's API and none of the judgement about
//   when it is the wrong tool.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. React.memo — a BET: comparison cost vs render cost. Usually a bad bet.
// 02. Referential equality — one Object.is rule wearing five costumes.
// 03. Avoiding re-renders — render ≠ repaint. Structure before memo.
// 04. Code splitting — JS is the expensive byte. Split at routes, preload.
// 05. React.lazy — throw the promise, cache the result, module scope only.
// 06. Dynamic import() — an OPERATOR returning the namespace, not the default.
// 07. Virtualization — cost ∝ viewport, not data. The one memo cannot fix.
// 08. Bundle analysis — your code is 10% of it. Delete before you split.
// 09. shouldComponentUpdate — a veto, and INVERTED relative to memo.
// 10. PureComponent — the same shallowEqual memo uses. The name lies.
// 11. Profiler API — baseDuration − actualDuration is what memo actually saved.
// 12. why-did-you-render — deep-compare, and report where React's shallow
//     check disagreed. That gap IS the definition of a wasted render.
// 13. Web Vitals — LCP 2.5s, INP 200ms, CLS 0.1, at p75 of REAL users.
// 14. Hydration — SSR paints early; hydration is the bill. It costs MORE than
//     a client render.
// 15. Suspense & streaming — the page becomes as fast as its FASTEST part.

const topics = [
  "React.memo — when to use",
  "Referential equality problem",
  "Avoiding unnecessary re-renders",
  "Code splitting (lazy + Suspense)",
  "React.lazy()",
  "Dynamic import()",
  "Virtualization (react-window)",
  "Bundle size analysis",
  "shouldComponentUpdate",
  "PureComponent",
  "Profiler API",
  "Why Did You Render",
  "Web Vitals (LCP, FCP, CLS, INP)",
  "Hydration performance",
  "Suspense & streaming",
];

console.log("Optimization Techniques topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01  memo skips a render when props are shallow-equal
//        ...and in most codebases it skips nothing at all
//
//   02  ...because the parent recreates an object every render. And it is not
//        one bug — the SAME Object.is rule breaks memo, useMemo, useCallback,
//        useEffect (where it is an infinite LOOP, not a slow render) and
//        context. One rule, five costumes.
//
//   03  → so stop reaching for memo first. A wasted render commits NOTHING to
//        the DOM; renders are cheap by design. Move state down, pass children,
//        split context, use selectors. Structure before tactics.
//
//   04-06 → and none of that touches the bigger cost: the megabyte of
//        JavaScript that must be downloaded, parsed and executed on the main
//        thread before anything works. Split at routes. Preload on intent.
//
//   07  → except for the one problem neither memo nor splitting can touch:
//        10,000 rows is 60,000 DOM nodes, paid on the FIRST render. Only
//        virtualization changes that complexity.
//
//   08  → and before any of it: MEASURE THE BUNDLE. Your own code is ~10%.
//        Deleting one bad import beats every optimization above it.
//
//   09-10 → the class-era ancestors of 01, because half the React in the world
//        is still class-based — and because the return value is inverted, which
//        is a live migration bug.
//
//   11-12 → none of the above is knowable without measurement. The Profiler
//        says what it cost; why-did-you-render says whether it was necessary.
//
//   13  → and none of it matters unless it moves LCP, INP or CLS at p75 of
//        real users. INP's processing time is where 01-12 actually lands.
//
//   14-15 → finally, the server. SSR buys an early paint and charges you
//        hydration for it. Streaming and selective hydration are how you stop
//        the whole page waiting for its slowest part.
//
// THE PUNCHLINE:
//   Almost every "React is slow" problem is one of three things: you shipped
//   too much JavaScript, you rendered too many components, or you never
//   measured. Memoization is the answer to the smallest of the three, and it
//   is the first thing everybody reaches for.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — CLIMB IN ORDER
// ══════════════════════════════════════════════════════════════════
//
//   0. MEASURE.  Profiler, highlight-updates, bundle analyzer,
//      field Web Vitals — on a PRODUCTION build.        (08, 11, 12, 13)
//   1. Is the BUNDLE the problem?     → delete a dependency. (08)
//   2. Is it a route you are not on?  → code split. (04, 05, 06)
//   3. Is state higher than it needs to be?
//                                     → move it down. (03 §6)
//   4. Is the expensive subtree re-created by the parent?
//                                     → pass it as `children`. (03 §6)
//   5. Does one context update wake the whole app?
//                                     → split it, or use selectors. (03 §7)
//   6. Is a prop unstable?            → fix it at the SOURCE. (02)
//   7. Is one component genuinely expensive AND its props stable?
//                                     → NOW memo it. (01)
//   8. Is the list longer than ~200 rows?
//                                     → virtualize. (07)
//   9. Is the work unavoidable but not urgent?
//                                     → startTransition / useDeferredValue.
//  10. Server rendering?              → stream it, and hydrate less. (14, 15)
//  11. RE-MEASURE. About a third of memoizations do nothing. (11 §7)
//
// Most people start at rung 7. Most rung-7 problems are rung-1 or rung-3
// problems.

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS SECTION PROVES
// ══════════════════════════════════════════════════════════════════
//
//   memo on 3 children                     16 renders  vs 7          (01)
//   ...vs simply moving state down         6 renders   vs 1          (01)
//   an object in a deps array              1000 effects vs 1         (02)
//   an inline context value                105 renders vs 21         (02)
//   10 wasted renders of a 51-node tree    459 compares, 1 DOM write (03)
//   one combined context provider          300 renders vs 135        (03)
//   a 1370KB bundle, visiting /login       91% of it never runs      (04)
//   3 nested lazy boundaries               870ms vs 450ms            (04)
//   preloading on hover                    300ms wait vs 50ms        (04)
//   lazy() inside a component              5 loads + 4 remounts vs 1 (05)
//   11 import() calls, 2 specifiers        2 network fetches         (06)
//   a 320KB library behind a click         95% never download it     (06)
//   10,000 rows                            60,000 nodes vs 126       (07)
//   five import-level changes              525KB → 138KB             (08)
//   a barrel import vs a deep path         1050KB vs 2.5KB           (08)
//   one sCU returning false                8 components frozen       (09)
//   PureComponent + an inline object       5 compares, 5 renders     (10)
//   memoization working                    1.5ms actual / 14.9ms base(11)
//   ...and broken                          actual EQUALS base        (11)
//   4 props React called "changed"         only 1 changed by value   (12)
//   three unreserved layout shifts         CLS 0.36 vs 0.00          (13)
//   400 components in a click handler      INP 480ms vs 115ms        (13)
//   SSR paint vs interactive               800ms vs 3400ms           (14)
//   hydration vs a client render           792ms vs 720ms — MORE     (14)
//   blocking SSR vs streaming              TTFB 1400ms vs 120ms      (15)
//   streaming + selective hydration        interactive 1880ms sooner (15)
//
// None of those are quoted. Every one is produced by code in the file.

// ══════════════════════════════════════════════════════════════════
// THE FIVE TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. Object.is IS THE ONLY COMPARISON
//    memo's props (01), every deps array (02), context values (02), sCU (09),
//    PureComponent (10), and the state bailout (03). An object literal anywhere
//    in that machinery means "always changed". This is the same rule as
//    04_state-patterns/13 — immutability and memoization are one mechanism
//    seen from two ends.
//
// 2. STRUCTURE BEATS MEMOIZATION
//    Moving state down (03), passing `children` (03), splitting context (03),
//    selectors (03), islands and Server Components (14). Every one removes the
//    render instead of skipping it — no comparison cost, no dependency array,
//    nothing to go stale. memo makes an expensive render conditional;
//    restructuring stops it being triggered.
//
// 3. THE EXPENSIVE BYTE IS JAVASCRIPT
//    Not because of download — because of parse, compile and execute, all on
//    the main thread. That is why deleting a dependency (08) beats splitting
//    it (04), why hydration costs more than a client render (14), and why
//    "ship less" is the answer to LCP, INP and TTI at the same time.
//
// 4. A SKIPPED RENDER FAILS SILENTLY
//    A wrong memo comparator (01), a wrong sCU (09), a mutation under
//    PureComponent (10), an over-narrow custom compare — all produce CORRECT
//    props and STALE output, with no error and no warning. That asymmetry is
//    why "measure, then memo" is not pedantry: an unnecessary render costs
//    milliseconds, and a wrongly-skipped one costs correctness.
//
// 5. IF YOU DID NOT MEASURE IT, IT DID NOT HAPPEN
//    A dev build is 3-5× slow and double-renders (11). Your laptop is 4× your
//    user's phone (11, 14). Lighthouse cannot measure INP at all (13). The
//    assessment is p75 of real users, not your average (13). And about a third
//    of memoizations change nothing — which you only learn by measuring twice.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// Section drill — the six questions this section should let you answer cold:
//   1. "The app feels slow." What do you do FIRST, and why not memo?
//   2. Why does adding memo often change nothing?
//   3. What can virtualization fix that memo structurally cannot?
//   4. How do you prove a memoization worked?
//   5. Which Web Vital does a wasted re-render damage, and through which part?
//   6. What does SSR cost you, and how do streaming and islands reduce it?

// ─────────────────────────────────────────────────────────────────
// END OF PHASE 2A, SECTION 2A.4.
//
// Still ahead in the docx:
//   2A.5 Patterns & Architecture — compound components, render props, HOCs,
//        container/presentational, provider and observer patterns, portals,
//        error boundaries, forwarding refs, slots, headless components,
//        controlled component design
//
// NEXT SECTION -> section-2a.5-patterns-and-architecture/06_design-patterns/
// ─────────────────────────────────────────────────────────────────
