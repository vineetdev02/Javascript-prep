// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  03_higher-order-components-hoc.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Higher-Order Components (HOC)
//
// WHAT YOU WILL MASTER HERE:
//   1. The definition, and why it is a FUNCTION rule, not a React rule
//   2. The #1 HOC bug: calling it inside render → remount → state loss (PROVEN)
//   3. The five things an HOC silently breaks: statics, refs, displayName,
//      prop collisions, types
//   4. Wrapper hell, measured in tree depth
//   5. Why React.memo and forwardRef are themselves HOCs
//   6. Which HOCs survived hooks, and the one job hooks structurally cannot do
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/03_higher-order-components-hoc.js"
//
// Prerequisites: 02_render-props-pattern.js (the sibling solution to the same
// problem) and 01_react-fundamentals/03_reconciliation-algorithm.js — you
// cannot understand §5 without knowing that React compares element TYPE.
//
// 02 shared logic by CALLING BACK. This file shares it by WRAPPING. Both lost
// to hooks; this one lost louder, and left more bugs behind.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Higher-Order Component:
// A function that takes a component and returns a NEW component with extra
// props or behaviour.
//
//   const withAuth = Component => props => {
//     const user = useAuth();                    // or this.context, pre-hooks
//     return user ? <Component {...props} user={user} /> : <Login />;
//   };
//
//   export default withAuth(Dashboard);          // ← module scope. Always.
//
// If interviewer says "explain it simply", say:
// "It's a higher-order FUNCTION applied to components. Same idea as a decorator
//  or middleware: you hand it a component, it hands you back a wrapped one that
//  does something extra first. React has no special support for it — it's just
//  a function that returns a function."
//
// If interviewer asks "why does it matter?", say:
// "It was the standard way to share cross-cutting concerns before hooks —
//  auth, routing, theming, data, analytics. Hooks replaced almost all of it,
//  but the pattern is still everywhere in real codebases, and it is still the
//  right answer for the things hooks cannot do: wrapping a component in an
//  error boundary or a Suspense boundary from the outside."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A NEW COMPONENT TYPE — and type identity is everything to React.
//
// Runtime rule:
//   withX(Component) is called ONCE, at import time, and produces one function.
//   React then compares element types by reference during reconciliation. Same
//   reference → update in place, state kept. Different reference → unmount the
//   old tree and mount a new one, state destroyed.
//
// Practical rule:
//   Call HOCs at module scope. Never inside render, never inside a component,
//   never inside a .map().
//
// Common trap:
//   `const Enhanced = withAuth(Dashboard)` written INSIDE the component body.
//   Every render creates a new function → new type → full remount. State,
//   scroll position, focus, uncontrolled input values: all gone, every render.
//   §5 proves it with a counter.
//
// The mental picture:
//
//   render props            HOC                     hook
//   ────────────            ───                     ────
//   <Owner render={fn}/>    withOwner(Comp)         useOwner()
//   nests at CALL site      nests at DEFINITION     no nesting
//   value in a closure      value arrives as prop   value is a variable
//   caller sees the wiring  wiring is invisible     wiring is one line


// ══════════════════════════════════════════════════════════════════
// § 3 — THE MECHANICS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — an HOC is a function returning a function:\n");

// ── a small React, enough to prove everything here ────────────────
function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}

// A renderer that models the ONE rule this file depends on: React keeps a
// component's state only while the element TYPE at that position is the same
// reference. Different reference → unmount + mount.
function createRenderer() {
  const slots = {};                 // slot → { type, state }
  let mounts = 0, unmounts = 0, depth = 0, maxDepth = 0;

  function renderTree(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(renderTree);
    const { type, props } = node;
    if (typeof type === "function") {
      depth++; maxDepth = Math.max(maxDepth, depth);
      const out = renderTree(type(props));
      depth--;
      return out;
    }
    return [`<${type}>`, ...renderTree(props.children), `</${type}>`];
  }

  function renderAt(slot, node) {
    const prev = slots[slot];
    if (!prev || prev.type !== node.type) {          // ← reconciliation, in one line
      if (prev) unmounts++;
      mounts++;
      slots[slot] = { type: node.type, state: { typed: "" } };
    }
    depth = 0;
    return { output: renderTree(node), state: slots[slot].state };
  }

  return {
    renderAt,
    render: node => { depth = 0; maxDepth = 0; return renderTree(node); },
    mounts: () => mounts,
    unmounts: () => unmounts,
    maxDepth: () => maxDepth,
  };
}

// A plain component:
function Dashboard(props) {
  return h("main", null, `dashboard for ${props.user ? props.user.name : "nobody"}`);
}

// The HOC:
function withAuth(Component) {
  function WithAuth(props) {
    const user = { name: "Vineet" };            // stands in for useAuth()/context
    return h(Component, { ...props, user });    // ← forward everything, add one
  }
  WithAuth.displayName = `withAuth(${Component.displayName || Component.name})`;
  return WithAuth;
}

const AuthedDashboard = withAuth(Dashboard);    // ✅ module scope, called ONCE

const r1 = createRenderer();
const out1 = r1.render(h(AuthedDashboard, { theme: "dark" }));

console.log("    typeof withAuth              :", typeof withAuth);
console.log("    typeof withAuth(Dashboard)   :", typeof AuthedDashboard);
console.log("    is it the same component?    :", AuthedDashboard === Dashboard);
console.log("    displayName                  :", AuthedDashboard.displayName);
console.log("    rendered output              :", JSON.stringify(out1));
console.log("    component layers in the tree :", r1.maxDepth());
console.log("\n  Three things worth naming out loud:");
console.log("    • the HOC ran at import time, not at render time");
console.log("    • it returned a DIFFERENT function — a new component type");
console.log("    • {...props} first, then the injected prop. Order decides who");
console.log("      wins when the names collide, and that is §6.4.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT THE HOC IS ACTUALLY FOR
// ══════════════════════════════════════════════════════════════════
//
// The four classic jobs, all of them cross-cutting:
//
//   withAuth(Page)          gate rendering on a user
//   withRouter(Comp)        inject match/location/history   (React Router v5)
//   connect(map)(Comp)      inject store slices             (react-redux)
//   withTheme(Comp)         inject the design tokens
//
// Every one of them answers "N unrelated components all need the same thing".
// And every one of them is now a hook: useAuth, useParams, useSelector,
// useTheme. That is not a coincidence — it is the same shape with the wrapper
// deleted. → 03_custom-hooks/09_composing-custom-hooks.js
//
// The rules of a WELL-BEHAVED HOC, worth reciting in an interview:
//
//   1. Do not mutate the input component. Compose it, never patch it.
//   2. Pass every prop through. You are a proxy; unknown props are not yours.
//   3. Name the wrapper: displayName = `withX(Inner)`.
//   4. Copy static methods (hoist-non-react-statics).
//   5. Forward the ref, or the caller loses access to the real component.
//   6. Call it at module scope. Once.
//
// Rules 3-6 are exactly the four ways HOCs break, and they are §5 and §6.


// ══════════════════════════════════════════════════════════════════
// § 5 — THE #1 HOC BUG: CALLING IT INSIDE RENDER
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the bug that eats your state:\n");

// ❌ THE BUG:
//   function Page(props) {
//     const Enhanced = withAuth(Dashboard);      // ← a NEW function every render
//     return <Enhanced {...props} />;
//   }
//
// React compares element types by reference. A brand-new function every render
// means a brand-new type every render, so React unmounts the whole subtree and
// mounts a fresh one. Everything below dies: state, refs, focus, scroll
// position, uncontrolled input values, in-flight effects.

const broken = createRenderer();
for (let render = 0; render < 5; render++) {
  const Enhanced = withAuth(Dashboard);          // 🐛 inside the render loop
  const { state } = broken.renderAt("page", h(Enhanced, {}));
  state.typed += "a";                            // the user types one character
}
const brokenState = broken.renderAt("page", h(withAuth(Dashboard), {})).state.typed;

const fixed = createRenderer();
const Enhanced = withAuth(Dashboard);            // ✅ module scope, once
for (let render = 0; render < 5; render++) {
  const { state } = fixed.renderAt("page", h(Enhanced, {}));
  state.typed += "a";
}
const fixedState = fixed.renderAt("page", h(Enhanced, {})).state.typed;

console.log("    5 renders, user typing one character each time:");
console.log("      HOC called inside render → mounts:", broken.mounts(), " unmounts:", broken.unmounts(), " text kept:", JSON.stringify(brokenState), "🐛");
console.log("      HOC called at module scope → mounts:", fixed.mounts(), " unmounts:", fixed.unmounts(), " text kept:", JSON.stringify(fixedState), "✅");
console.log("\n  Six mounts for one component. Every keystroke threw away the input's");
console.log("  own state, so the field appears to reject typing — the classic");
console.log("  'my input only accepts one character' bug report.");
console.log("\n  The same rule bites in three other disguises:");
console.log("    • defining a component INSIDE another component (no HOC needed)");
console.log("    • styled(Button) inside render — same mechanism, styled-components");
console.log("    • React.memo(Comp) or lazy(() => …) inside render");
console.log("      → 05_optimization-techniques/05_react-lazy.js\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE FIVE THINGS AN HOC SILENTLY BREAKS
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the wrapper is not transparent:\n");

// ── 6.1 STATIC METHODS ARE LOST ───────────────────────────────────
function Button(props) { return h("button", null, props.children); }
Button.defaultSize = "md";
Button.variants = ["primary", "ghost"];
Button.getInitialProps = () => ({ ok: true });   // Next.js used to need this

const staticsBefore = Object.keys(Button).length;

function withLogging(Component) {
  function WithLogging(props) { return h(Component, props); }
  WithLogging.displayName = `withLogging(${Component.name})`;
  return WithLogging;
}
const LoggedButton = withLogging(Button);
const staticsAfter = Object.keys(LoggedButton).filter(k => k !== "displayName").length;

// The fix, which is what hoist-non-react-statics does in ~20 lines:
function hoistStatics(target, source) {
  for (const key of Object.keys(source)) {
    if (!(key in target)) target[key] = source[key];
  }
  return target;
}
const HoistedButton = hoistStatics(withLogging(Button), Button);
const staticsHoisted = Object.keys(HoistedButton).filter(k => k !== "displayName").length;

console.log("    1. statics — Button has", staticsBefore, "→ wrapped has", staticsAfter, "🐛 → hoisted", staticsHoisted, "✅");
console.log("       LoggedButton.defaultSize is", LoggedButton.defaultSize, "— and nothing warned you.");

// ── 6.2 REFS DO NOT PASS THROUGH ──────────────────────────────────
// <LoggedButton ref={r} /> attaches the ref to the WRAPPER, not to Button.
// `ref` is not a prop — it never appears in props, so {...props} cannot
// forward it. The fix is forwardRef. → 09_forwarding-refs.js
const propsSeenByWrapper = { onClick: () => {}, children: "Save" };   // no `ref` key, ever
console.log("    2. refs   — `ref` in the props the wrapper receives?",
  "ref" in propsSeenByWrapper, "🐛 → forwardRef. → 09");

// ── 6.3 displayName ───────────────────────────────────────────────
function withNothing(Component) {
  return function (props) { return h(Component, props); };   // anonymous 🐛
}
const Anon = withNothing(Button);
console.log("    3. DevTools — named:", JSON.stringify(LoggedButton.displayName),
  " unnamed:", JSON.stringify(Anon.displayName || Anon.name || "(anonymous)"), "🐛");

// ── 6.4 PROP COLLISIONS, SILENTLY ─────────────────────────────────
function withUser(Component) {
  return props => h(Component, { ...props, data: { kind: "user" } });
}
function withOrders(Component) {
  return props => h(Component, { ...props, data: { kind: "orders" } });
}
let received = null;
function Profile(props) { received = props.data.kind; return h("div", null, received); }

const r2 = createRenderer();
r2.render(h(withUser(withOrders(Profile)), {}));
const collisionWinner = received;

console.log("    4. collisions — two HOCs both inject `data`; the component saw:",
  JSON.stringify(collisionWinner), "🐛");
console.log("       No error, no warning. The INNER wrapper wins, because it spreads last.");
console.log("       Reverse the composition order and the value silently flips.");

// ── 6.5 TYPES ─────────────────────────────────────────────────────
console.log("    5. types  — TS must subtract injected props from the public type:");
console.log("       Omit<P, 'user'> per HOC, composed. Render props type themselves; HOCs do not.");
console.log("\n  Five silent failures. Not one of them throws. That is the real");
console.log("  argument against HOCs — not the syntax, the SILENCE.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WRAPPER HELL, MEASURED
// ══════════════════════════════════════════════════════════════════

console.log("§7 — what four HOCs do to your tree:\n");

const compose = (...fns) => x => fns.reduceRight((acc, fn) => fn(acc), x);

function withTheme(C) { const W = p => h(C, { ...p, theme: "dark" }); W.displayName = `withTheme(${C.displayName || C.name})`; return W; }
function withRouter(C) { const W = p => h(C, { ...p, route: "/x" }); W.displayName = `withRouter(${C.displayName || C.name})`; return W; }
function withI18n(C) { const W = p => h(C, { ...p, t: k => k }); W.displayName = `withI18n(${C.displayName || C.name})`; return W; }

function Screen(props) { return h("section", null, "screen"); }

const Wrapped = compose(withTheme, withRouter, withI18n, withAuth)(Screen);

const r3 = createRenderer();
r3.render(h(Wrapped, {}));

console.log("    compose(withTheme, withRouter, withI18n, withAuth)(Screen)");
console.log("      DevTools name    :", Wrapped.displayName);
console.log("      component layers :", r3.maxDepth(), "(4 wrappers + Screen)");

const r4 = createRenderer();
r4.render(h(Screen, {}));
console.log("      with hooks instead:", r4.maxDepth(), "layer — useTheme(), useRoute(), useT(), useAuth()");

console.log("\n  Every layer is a real component: a real render, a real fiber, a real");
console.log("  line in the Profiler, and five more rows to scroll past in DevTools");
console.log("  before you reach the component you are debugging. Multiply by every");
console.log("  screen in the app.");
console.log("\n  And the injected props arrive from NOWHERE. Reading Screen's source");
console.log("  tells you nothing about where `theme` came from — you have to find");
console.log("  the export line at the bottom of the file. A hook call is visible");
console.log("  exactly where the value is used.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE HOCs THAT SURVIVED (AND ONE HOOKS CANNOT REPLACE)
// ══════════════════════════════════════════════════════════════════

console.log("§8 — HOCs you use every day without noticing:\n");

// React.memo IS an HOC. So is forwardRef. Same shape: component in, component
// out. This is the cleanest way to prove HOCs are not obsolete — you cannot
// write memo as a hook, because a hook runs INSIDE the component and memo has
// to sit OUTSIDE it, deciding whether to run it at all.
const builtIn = [
  ["React.memo(Comp)", "skip the render when props are shallow-equal", "must sit OUTSIDE the component"],
  ["React.forwardRef(Comp)", "let a ref reach the inner element", "ref is not a prop; only a wrapper can move it"],
  ["React.lazy(() => import())", "defer the module", "the component does not exist yet"],
  ["connect(mapState)(Comp)", "react-redux, pre-hooks", "still in millions of lines of code"],
  ["withErrorBoundary(Comp)", "catch render errors below", "componentDidCatch has NO hook equivalent"],
  ["withProfiler(Comp)", "Sentry / analytics wrapping", "must own the boundary, not the body"],
];
builtIn.forEach(([api, does, why]) => {
  console.log(`    ${api.padEnd(26)} ${does}`);
  console.log(`    ${" ".repeat(26)} → ${why}`);
});

// Prove the shape claim rather than asserting it:
function memoLike(Component) { const M = p => h(Component, p); M.isMemo = true; return M; }
const MemoScreen = memoLike(Screen);
console.log("\n    memo's shape: component in →", typeof MemoScreen, "out, and", MemoScreen === Screen ? "the same" : "a different", "type ✅");

console.log("\n  The one job hooks structurally cannot do: WRAPPING. An error");
console.log("  boundary, a Suspense boundary, a Profiler, a memo — each of them");
console.log("  must exist as a component ABOVE the one it protects or measures.");
console.log("  A hook runs inside the component, which is exactly the place that");
console.log("  is already broken when the render throws. → 08_error-boundaries.js\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — HOC vs RENDER PROPS vs HOOKS
// ══════════════════════════════════════════════════════════════════
//
//                        HOC              Render prop        Hook
//   ─────────────────────────────────────────────────────────────────
//   shares               behaviour        behaviour          logic
//   composition          nested calls     nested JSX         flat calls
//   tree depth (4×)      5 layers         5 layers           1 layer
//   value arrives as     a prop           a callback arg     a variable
//   name collisions      silent 🐛        impossible         impossible
//   refs                 broken 🐛        fine               fine
//   statics              lost 🐛          fine               fine
//   DevTools             withA(withB(…))  clean              clean
//   TypeScript           painful          good               best
//   can wrap the tree    YES ✅           no                 no
//   works in classes     YES              YES                no
//
// Read the last two rows. They are the entire reason HOCs still exist.
//
// The migration recipe, if they ask how you would modernize a codebase:
//   1. Write the hook first (useAuth), and make the HOC call it.
//      → both APIs work, zero call sites change, nothing breaks.
//   2. Migrate consumers file by file, deleting the wrapper as you go.
//   3. Keep withErrorBoundary and memo. They are not the problem.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "My input only accepts one character":
//   The HOC (or styled(), or memo()) is called inside render. New type every
//   render → remount → state gone. → §5. THE classic.
//
// Bug 2 — "Button.defaultSize is undefined after I added withLogging":
//   Statics are not copied. → §6.1, hoist-non-react-statics.
//
// Bug 3 — "My ref is null" / "focus() is not a function":
//   The ref landed on the wrapper. → §6.2 → 09_forwarding-refs.js.
//
// Bug 4 — Two HOCs, one prop name, wrong data on screen:
//   Silent overwrite decided by composition order. → §6.4.
//
// Bug 5 — DevTools is a wall of <Anonymous>:
//   No displayName on the returned function. → §6.3.
//
// Bug 6 — Effects re-run on every parent render:
//   Same root cause as Bug 1 — the remount re-runs every mount effect.
//
// Bug 7 — "Why is this prop here?":
//   An injected prop with no visible source. Maintenance cost, not a crash,
//   and the reason teams migrate. → §7.
//
// Bug 8 — connect() re-renders everything after a store change:
//   mapStateToProps returns a new object literal, so shallow compare fails.
//   Same Object.is rule as everywhere else.
//   → 05_optimization-techniques/02_referential-equality-problem.js


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Mechanics:
assert(typeof AuthedDashboard === "function", "an HOC returns a component");
assert(AuthedDashboard !== Dashboard, "...a DIFFERENT one — a new type");
assert(AuthedDashboard.displayName === "withAuth(Dashboard)", "name the wrapper for DevTools");
assert(out1.includes("dashboard for Vineet"), "the injected prop reached the inner component");
assert(r1.maxDepth() === 2, "one HOC = one extra component layer");

// The #1 bug:
assert(broken.mounts() === 6 && broken.unmounts() === 5,
  "HOC inside render → a new type every render → remount every render 🐛");
assert(brokenState === "", "...so everything typed is thrown away 🐛");
assert(fixed.mounts() === 1 && fixed.unmounts() === 0,
  "HOC at module scope → mounted once ✅");
assert(fixedState === "aaaaa", "...and five keystrokes survive ✅");

// The five silent breakages:
assert(staticsBefore === 3 && staticsAfter === 0, "statics do not survive wrapping 🐛");
assert(staticsHoisted === 3, "hoist-non-react-statics restores all three ✅");
assert(LoggedButton.defaultSize === undefined, "...and until you do, this is undefined");
assert(HoistedButton.defaultSize === "md", "after hoisting, it is back");
assert(("ref" in propsSeenByWrapper) === false, "`ref` is never in props — {...props} cannot forward it 🐛");
assert(!Anon.displayName && !Anon.name, "an unnamed wrapper is <Anonymous> in DevTools 🐛");
assert(collisionWinner === "orders",
  "two HOCs injecting `data` → the inner one wins, silently 🐛");

// Wrapper hell:
assert(r3.maxDepth() === 5, "4 HOCs = 5 component layers for one screen");
assert(r4.maxDepth() === 1, "...the hooks version is 1");
assert(Wrapped.displayName === "withTheme(withRouter(withI18n(withAuth(Screen))))",
  "the DevTools name IS the composition, spelled out");

// What survives:
assert(MemoScreen !== Screen && typeof MemoScreen === "function",
  "React.memo has the exact shape of an HOC — component in, component out ✅");

console.log("§11 — mini assertions passed for: Higher-Order Components (HOC)");
console.log("\n  The pair that captures it: calling the HOC inside render turned 1");
console.log("  mount into 6 and lost all 5 keystrokes — and four composed HOCs turned");
console.log("  a 1-layer tree into a 5-layer one, with statics, refs and one prop");
console.log("  name quietly destroyed on the way.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a higher-order component?", answer:
//
//   "A function that takes a component and returns a new component with extra
//    behaviour or props — withAuth(Dashboard). It's not a React feature, it's
//    just a higher-order function applied to components, the same idea as
//    middleware or a decorator. It was the standard way to share cross-cutting
//    concerns before hooks: withRouter, connect, withTheme, withTranslation.
//
//    The single most important rule is that you call it at module scope. If
//    you call it inside render, you create a new function every render, React
//    sees a new element type at that position, and it unmounts the whole
//    subtree and mounts a fresh one. State, refs, focus and scroll position
//    all reset on every render — that's the 'my input only accepts one
//    character' bug, and it's the same mechanism as defining a component
//    inside another component, or calling styled() or memo() in a render.
//
//    Beyond that, the problem with HOCs is that everything they break, they
//    break silently. Static methods don't survive wrapping unless you hoist
//    them. Refs land on the wrapper, because ref isn't a prop, so {...props}
//    can't forward it — you need forwardRef. Without a displayName, DevTools
//    is a wall of Anonymous. And if two HOCs inject the same prop name, one
//    just wins depending on composition order, with no warning. None of those
//    throw.
//
//    Hooks replaced them for logic sharing because composition is flat: four
//    HOCs is five component layers and four props arriving from nowhere, and
//    four hooks is four visible lines inside the component that needs them.
//
//    But I'd push back on 'HOCs are obsolete', because React.memo, forwardRef
//    and lazy are all HOCs by shape, and there's one job a hook structurally
//    cannot do: wrapping. An error boundary, a Suspense boundary, a Profiler —
//    those have to be a component ABOVE the one they protect. componentDidCatch
//    still has no hook equivalent, which is why withErrorBoundary exists in
//    2025. So my migration rule is: write the hook, have the HOC call the hook,
//    migrate call sites gradually, and keep the HOCs that wrap."
//
// The "everything it breaks, it breaks silently" line and the wrapping
// argument are what make this senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why must an HOC be called at module scope?
// A1. Reconciliation compares element type by reference. A new function each
//     render is a new type, which unmounts and remounts the subtree.
//
// Q2. Why don't refs pass through an HOC?
// A2. `ref` is not part of props — React strips it. Only forwardRef can move it.
//
// Q3. What is hoist-non-react-statics for?
// A3. Copying the inner component's static properties onto the wrapper, while
//     skipping React's own statics (propTypes, defaultProps, contextType).
//
// Q4. Two HOCs inject `data`. What happens?
// A4. The one that spreads last wins, silently. Composition order decides.
//
// Q5. HOC vs render prop?
// A5. Same job, different wiring. HOC nests at definition and injects props;
//     render prop nests at the call site and passes arguments. Render props
//     have no collision or ref problem; HOCs can wrap the tree.
//
// Q6. Is React.memo an HOC?
// A6. Yes — component in, component out. So are forwardRef and lazy.
//
// Q7. Can a hook replace withErrorBoundary?
// A7. No. There is no useErrorBoundary that catches a render error in the same
//     component; a boundary must be an ancestor. → 08.
//
// Q8. How would you migrate 200 HOC call sites?
// A8. Write the hook, make the HOC a two-line wrapper over the hook, migrate
//     file by file, delete the HOC last. Both APIs work during the migration.
//
// Q9. Do HOCs hurt performance?
// A9. Each layer is a real fiber and a real render, so a deep stack costs
//     something — but the real cost is the remount bug, which is unbounded.
//
// Q10. When would you still write a NEW HOC in 2025?
// A10. When it wraps: error boundary, suspense boundary, profiler, memo. Or
//      when the consumer must be a class component.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: HOC, in one line?
//   Back : Component in, enhanced component out. A function, not a React API.
//
// Flashcard 2:
//   Front: The #1 HOC bug?
//   Back : Calling it inside render → new type → remount → state lost.
//
// Flashcard 3:
//   Front: Why is my ref null through an HOC?
//   Back : ref is not a prop. Use forwardRef.
//
// Flashcard 4:
//   Front: What does hoist-non-react-statics fix?
//   Back : Static methods lost when the wrapper replaces the component.
//
// Flashcard 5:
//   Front: Two HOCs inject the same prop?
//   Back : Last spread wins. Silent. Order-dependent.
//
// Flashcard 6:
//   Front: Name three built-in HOCs.
//   Back : memo, forwardRef, lazy.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Hooks replaced HOCs for logic, not for WRAPPING. A boundary has to
//          be a component above the one it protects."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write withLogging(Component) that logs mount and every render. Give it a
//   displayName and confirm it in DevTools.
//
// Task 2:
//   Call it inside a component's body. Type in an input below it. Watch the
//   text vanish. Then move the call to module scope and type again.
//
// Task 3:
//   Add a static to the inner component, wrap it, and watch the static
//   disappear. Write your own 10-line hoistStatics.
//
// Task 4:
//   Try to focus() the inner input through the HOC. Fail. Then fix it with
//   forwardRef. → 09_forwarding-refs.js
//
// Task 5:
//   Compose four HOCs and look at the React DevTools tree. Then rewrite it
//   with four hooks and look again.
//
// Task 6:
//   Write two HOCs that both inject `data`. Swap the composition order and
//   watch the rendered value change with no warning.
//
// Task 7:
//   Convert withAuth into useAuth, then rewrite withAuth to call useAuth so
//   both APIs work at once. That is the real migration.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   An HOC returns a NEW COMPONENT TYPE, so it must be called once, at module
//   scope. Inside render it remounts the subtree on every render.
//
// If you remember the common bug:
//   State that resets for no reason. Look for a component or wrapper being
//   created during render.
//
// If you remember the professional framing:
//   Hooks won the logic-sharing job because composition is flat and nothing is
//   injected invisibly. HOCs keep the wrapping job — memo, lazy, forwardRef,
//   error boundaries — because a wrapper has to exist above the component, and
//   a hook runs inside it.
//
// NEXT TOPIC -> 04_container-presentational-pattern.js
