// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Design Patterns — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.5 — Patterns & Architecture.
// It follows 2A.4 (Performance). The other group in this section is
// ◆ React Router v6, which lives in 07_react-router-v6/.
//
// Folder:
//   learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/
//
// Files:
// ├── index.js
// ├── 01_compound-component-pattern.js
// ├── 02_render-props-pattern.js
// ├── 03_higher-order-components-hoc.js
// ├── 04_container-presentational-pattern.js
// ├── 05_provider-pattern.js
// ├── 06_observer-pattern.js
// ├── 07_portals.js
// ├── 08_error-boundaries.js
// ├── 09_forwarding-refs.js
// ├── 10_slot-pattern.js
// ├── 11_headless-components.js
// ├── 12_controlled-component-design.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// READ IN ORDER:
//   These twelve are not a catalogue, they are one argument in four movements.
//   01-03 are three answers to the SAME question — how do components share
//   behaviour — and two of them lost to hooks. 04-06 are about where state
//   lives. 07-09 are the three escape hatches out of React's own model.
//   10-12 are how you design the API other people will use. Reading 11 first
//   will teach you what Radix does and none of the six patterns it is made of.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Compound components — state via context, LAYOUT given to the caller.
//     cloneElement is the wrong implementation, and it works in the demo.
// 02. Render props — the prop is a function. Hooks won; the per-row callback
//     survived.
// 03. HOCs — a NEW component type, so call it at module scope or lose your
//     state. Everything it breaks, it breaks silently.
// 04. Container / presentational — the presentational half is a PURE FUNCTION
//     OF PROPS. Abramov retracted the two-component spelling; the seam lived.
// 05. Provider — one writer, many readers, and every reader wakes on every
//     write. Split by update frequency, not by domain.
// 06. Observer — subscribe returns unsubscribe. The machine under every store,
//     and under useSyncExternalStore.
// 07. Portals — different DOM parent, same React parent. Painting follows the
//     DOM tree; behaviour follows React's.
// 08. Error boundaries — they do not prevent errors, they choose the blast
//     radius. Still a class, on purpose.
// 09. Forwarding refs — ref is not a prop (before React 19). One wrapper that
//     does not forward turns a DOM node into null.
// 10. Slots — named children. The component keeps the arrangement, and an
//     element prop comes with a free render bailout.
// 11. Headless — behaviour and accessibility, zero markup. Six of the patterns
//     above, assembled at a library boundary.
// 12. Controlled design — who owns the VALUE. Decide the mode once, and never
//     keep a copy of something the caller owns.

const topics = [
  "Compound Component Pattern",
  "Render Props Pattern",
  "Higher-Order Components (HOC)",
  "Container / Presentational Pattern",
  "Provider Pattern",
  "Observer Pattern",
  "Portals",
  "Error Boundaries",
  "Forwarding Refs",
  "Slot Pattern",
  "Headless Components",
  "Controlled component design",
];

console.log("Design Patterns topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01  A component with enough props stops being a component and becomes a
//        bad templating language. Give the LAYOUT back to the caller and share
//        state through context instead.
//
//   02  ...but sometimes the caller needs a VALUE the component owns, not just
//        a place to put markup. So pass them a function and call it. This was
//        the pre-hooks answer to sharing logic, and its shape depends on how
//        many things you compose — three pieces of state, three nesting levels.
//
//   03  The other pre-hooks answer: wrap instead of call back. Flat at the call
//        site, invisible at the definition — and it silently breaks refs,
//        statics, DevTools names and any prop name two HOCs both use.
//
//   → hooks won 02 and 03 for LOGIC. They did not win WRAPPING, which is why
//     memo, lazy, forwardRef and error boundaries are all still HOCs.
//
//   04  Second question: where does the DATA come from? Split the component
//        and the view becomes a pure function of props — four UI states from
//        four plain objects instead of four mocked dependencies.
//
//   05  That split needs a transport, and context is it. One writer, many
//        readers — and every reader re-renders on every write, whatever slice
//        it reads. So the design decisions are how many providers and how fat.
//
//   06  → which is context's ceiling. A store compares the SLICE each
//        subscriber asked for. That is the observer pattern, and it is also
//        addEventListener, ResizeObserver, Redux and useSyncExternalStore.
//
//   07-09  Three escape hatches, one per layer React abstracts:
//        07 the DOM position (a portal, for CSS containment)
//        08 the failure model (a boundary, for blast radius)
//        09 the DOM node itself (a ref, forwarded through every wrapper)
//        Each one buys power by making two models disagree, and each file is
//        mostly about the bill.
//
//   10-12  Finally: you are the one writing the component now.
//        10 keep the arrangement, hand out named holes
//        11 keep the behaviour and the aria, hand out ALL the markup
//        12 decide who owns the value, once, and never keep a copy
//
// THE PUNCHLINE:
//   Every pattern here answers one question — WHO OWNS WHAT — and every bug in
//   the section is two parties believing they own the same thing. A memo that
//   never skips, a ref that is null, a context consumer that re-renders, a
//   dropdown that closes itself, a field frozen on its first value: all
//   ownership disputes. → 12 §9 lists all twelve.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — WHICH PATTERN, AND WHEN
// ══════════════════════════════════════════════════════════════════
//
//   Does the caller need a VALUE you own?
//     ...once per render        → a custom hook.               (02 §8)
//     ...many times per render  → a render prop / prop getter.  (02, 11)
//
//   Does the caller need to supply MARKUP?
//     ...and control the order  → compound components.          (01)
//     ...but not the order      → slots.                        (10)
//     ...all of it              → headless.                     (11)
//     ...onto YOUR element      → asChild / Slot.               (10 §7)
//
//   Does something need to WRAP the tree?
//     ...to skip renders        → memo.                         (03 §8)
//     ...to catch failures      → an error boundary.            (08)
//     ...to publish a value     → a provider.                   (05)
//
//   Where does the state live?
//     ...one subtree, rare updates → context.                   (05)
//     ...hot, read narrowly        → an observable store.       (06)
//     ...the caller's                → controlled.              (12)
//     ...the component's             → uncontrolled + key.      (12 §7)
//
//   Do you need to break out of React's model?
//     ...out of a CSS container → a portal.                     (07)
//     ...down to a DOM node     → a forwarded ref.              (09)
//
// Most people start at "compound components" because it is the one with a
// name they recognise. Most of those problems are slot problems.

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS SECTION PROVES
// ══════════════════════════════════════════════════════════════════
//
//   five design requests on a config-prop API     4 props → 13         (01)
//   cloneElement, then someone adds a <div>       3/3 → 0/3 injected   (01)
//   three different layouts, compound API         0 new props          (01)
//   the same effect in three components           21 lines → 7         (02)
//   three pieces of shared logic                  3 nesting levels → 0 (02)
//   an inline render prop under memo              5 renders, 0 skips   (02)
//   a react-window row callback                   1 fn, 4 calls        (02)
//   an HOC called inside render                   1 mount → 6, text "" (03)
//   wrapping a component with statics             3 statics → 0 → 3    (03)
//   four composed HOCs                            1 layer → 5          (03)
//   a component that fetches, routes and themes   4 stubs → 0          (04)
//   REST vs GraphQL vs localStorage               identical markup     (04)
//   loading / error / empty / data                4 states, 0 mocks    (04)
//   value={{ … }} with 3 memoized consumers       3 renders → 12       (05)
//   one fat context vs three thin ones            12 → 6               (05)
//   dispatch in its own context                   4 renders → 1        (05)
//   60 mouse moves through context                180 vs 60 renders    (05)
//   five mounts with no unsubscribe               1 listener → 5       (06)
//   a listener that unsubscribes itself           2 of 3 notified      (06)
//   an uncached getSnapshot                       25 renders vs 2      (06)
//   20 store writes with selectors                60 wakes → 20        (06)
//   a modal inside overflow+transform+z-index     3/3 walls → 0/3      (07)
//   portalling to <body>                          5 ancestors → 1      (07)
//   what createPortal gives you for a dialog      2 of 8               (07)
//   one throwing widget, no boundary              0 of 5 alive         (08)
//   ...root boundary vs per-widget                0 of 5 vs 4 of 5     (08)
//   where an error can come from                  1 of 4 caught        (08)
//   a 3-wrapper chain, middle one not forwarding  DOM node → null      (09)
//   useImperativeHandle instead of the node       9 props → 2          (09)
//   a chart created inside vs passed in           5 renders → 1        (10)
//   asChild on <Button><a/></Button>              1 wrapper → 0        (10)
//   one styled component, one visual change       5 escape hatches     (11)
//   one headless hook, two unrelated UIs          14 shared props      (11)
//   an accessible combobox                        14 requirements, 0 yours (11)
//   controlled with a no-op onChange              "abcde" → ""         (12)
//   20 keystrokes, 8 sibling fields               160 sibling renders  (12)
//   useState(props.value) across a refetch        frozen on value #1   (12)
//
// None of those are quoted. Every one is produced by code in the file.

// ══════════════════════════════════════════════════════════════════
// THE FIVE TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. `children` IS A FLAT LIST OF DESCRIPTIONS
//    Which is why React.Children.map + cloneElement (01), child-type
//    detection (10) and anything that pattern-matches on child shape breaks
//    the first time somebody wraps a child in a <div>. Context and element
//    props cannot break that way, because they never inspect the tree.
//
// 2. IDENTITY DECIDES EVERYTHING
//    A new function type remounts a subtree (03). A new value object wakes
//    every context consumer (05). A new snapshot object loops forever (06).
//    A new callback ref detaches and reattaches (09). The SAME element object
//    skips a whole subtree for free (10). One Object.is rule, five patterns —
//    the same rule as 05_optimization-techniques/02.
//
// 3. HOOKS REPLACED SHARING, NOT WRAPPING
//    A hook runs INSIDE the component. Anything that must sit ABOVE one —
//    memo, lazy, a Suspense boundary, an error boundary, a provider — is
//    still a component, and usually still an HOC (03 §8, 08 §8). "Hooks made
//    HOCs obsolete" is half true, and the half that is false is the half
//    interviewers ask about.
//
// 4. THE WRAPPER MUST BE TRANSPARENT
//    A wrapper that swallows a ref (09), overwrites a className (10 §7),
//    replaces a handler (11 §5) or drops a static (03 §6) is not composable —
//    and every one of those failures is silent. Merge, never replace: refs
//    merged, classNames concatenated, handlers composed with the caller's
//    running first.
//
// 5. THE HARD PART IS ACCESSIBILITY, AND IT IS ALWAYS YOURS
//    Compound components hand you the DOM and therefore the aria wiring
//    (01 §9). A portal solves 2 of a dialog's 8 requirements (07 §7). A
//    combobox needs 14 things nobody writes by hand (11 §6). Slots move the
//    responsibility to the caller (10 §9). This is the actual reason headless
//    libraries won — not styling.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// Section drill — the seven questions this section should let you answer cold:
//   1. Compound components, slots, render props: how do you choose?
//   2. What did hooks replace, and what can they structurally never replace?
//   3. Why does adding a provider slow the app down, and what do you split?
//   4. Why does a portalled dropdown close when you click it?
//   5. Where do error boundaries go, and what do they not catch?
//   6. Why is my ref null, and what changed in React 19?
//   7. How would you design a <Switch> that works controlled AND uncontrolled?

// ─────────────────────────────────────────────────────────────────
// END OF ◆ DESIGN PATTERNS (2A.5, group 1 of 2).
//
// Still ahead in this section:
//   ◆ React Router v6 — BrowserRouter vs HashRouter, route params & useParams,
//     nested routes + Outlet, protected routes, Redirect / Navigate,
//     useNavigate, useLocation & useSearchParams, lazy-loaded routes,
//     Loader & Action (v6.4+)
//
// NEXT SECTION -> section-2a.5-patterns-and-architecture/07_react-router-v6/
// ─────────────────────────────────────────────────────────────────
