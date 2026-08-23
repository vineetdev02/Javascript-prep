// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  05_provider-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Provider Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. Prop drilling, counted — how many files touch a prop they never use
//   2. Nested providers: scoping and shadowing, proven
//   3. The inline `value={{…}}` bug — 12 renders where 3 were needed
//   4. Context is ALL-OR-NOTHING: why one fat provider wakes the whole app
//   5. The state/dispatch split — the trick that makes writers free
//   6. Provider hell, and what flattening it actually fixes (and does not)
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/05_provider-pattern.js"
//
// Prerequisites: 02_built-in-hooks/04_usecontext-use-case.js and
// 04_state-patterns/03_context-api-provider-pattern.js — that file teaches the
// API. THIS file treats the provider as an architectural unit: how many you
// have, where they sit, what they contain, and what each one costs.
//
// 01 used a provider as a private wire inside one component family. Here it
// becomes the app's backbone — and every backbone decision has a render cost.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Provider Pattern:
// A component that publishes a value into a React context, so any descendant
// at any depth can read it directly instead of receiving it as a prop.
//
//   <ThemeContext.Provider value={theme}>
//     <App />                    {/* every descendant can useContext(ThemeContext) */}
//   </ThemeContext.Provider>
//
// If interviewer says "explain it simply", say:
// "It's a broadcast. One component puts a value on a channel, and anything
//  below it can tune in — no props, no matter how deep. The components in
//  between don't have to know the value exists."
//
// If interviewer asks "why does it matter?", say:
// "Because without it, a value used at depth six has to be threaded through
//  five components that don't care about it, and every one of those becomes a
//  file you edit when the value changes shape. But the important half of the
//  answer is the cost: every consumer of a context re-renders whenever the
//  provider's value changes by reference — memo doesn't stop it — so the
//  design questions are how many providers you have and how fat each one is."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE WRITER, MANY READERS — and every reader wakes on every write.
//
// Runtime rule:
//   A consumer re-renders when the provider's `value` changes by Object.is.
//   Not when the part it reads changes — when the VALUE does. React.memo on
//   the consumer does not help: context is a subscription, not a prop.
//   → 05_optimization-techniques/01_react-memo-when-to-use.js §6.3
//
// Practical rule:
//   Context is for values that are read WIDELY and change RARELY: theme,
//   locale, auth, feature flags, a dispatch function. The moment a value
//   changes on every keystroke or every frame, context is the wrong tool.
//
// Common trap:
//   `<Ctx.Provider value={{ user, setUser }}>` — an object literal created
//   during the provider's render is a new reference every time, so every
//   consumer in the app re-renders on every parent render, forever. §5.
//
// The mental picture:
//
//   prop drilling                 provider
//   ─────────────                 ────────
//   6 files mention `theme`       2 files mention `theme`
//   explicit, greppable           implicit, must know the context exists
//   only the leaf re-renders      EVERY consumer re-renders on any change
//   refactor = touch 6 files      refactor = touch 1 file


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM: COUNT THE FILES THAT DO NOT CARE
// ══════════════════════════════════════════════════════════════════

console.log("§3 — prop drilling, measured:\n");

// ── a small React with context + memo + context subscriptions ──────
const PROVIDER = Symbol("Provider");

function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}

function createContext(defaultValue) {
  return { _stack: [defaultValue] };
}
// <Ctx.Provider value={v}>{children}</Ctx.Provider>, as a plain element:
function provide(ctx, value, children) {
  return { type: PROVIDER, props: { ctx, value, children } };
}

function createRenderer() {
  const records = {};          // name → { props, reads: Map<ctx, value>, output }
  const counts = {};
  const memoized = new Set();
  let current = null;
  let skips = 0;

  function useContext(ctx) {
    const value = ctx._stack[ctx._stack.length - 1];
    if (current) current.reads.set(ctx, value);   // record the subscription
    return value;
  }

  function shallowEqual(a, b) {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => Object.is(a[k], b[k]));
  }

  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props } = node;

    if (type === PROVIDER) {
      props.ctx._stack.push(props.value);
      const out = render(props.children);
      props.ctx._stack.pop();
      return out;
    }

    if (typeof type === "function") {
      const name = type.name;
      const prev = records[name];
      const contextUnchanged = prev &&
        [...prev.reads].every(([ctx, v]) => Object.is(ctx._stack[ctx._stack.length - 1], v));
      // The real bailout: props equal AND every subscribed context unchanged.
      if (memoized.has(name) && prev && shallowEqual(prev.props, props) && contextUnchanged) {
        skips++;
        return prev.output;
      }
      const rec = { props, reads: new Map(), output: [] };
      const outer = current;
      current = rec;
      const rendered = type(props);
      current = outer;
      counts[name] = (counts[name] || 0) + 1;
      rec.output = render(rendered);
      records[name] = rec;
      return rec.output;
    }

    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }

  return {
    render,
    useContext,
    memo: (...names) => names.forEach(n => memoized.add(n)),
    count: n => counts[n] || 0,
    total: () => Object.values(counts).reduce((a, b) => a + b, 0),
    skips: () => skips,
    reset: () => { for (const k in counts) delete counts[k]; skips = 0; },
  };
}

// The drilled version: `theme` travels through five components that never use it.
function Leaf_drilled(props) { return h("button", null, `theme=${props.theme}`); }
function D5(props) { return h(Leaf_drilled, { theme: props.theme }); }
function D4(props) { return h(D5, { theme: props.theme }); }
function D3(props) { return h(D4, { theme: props.theme }); }
function D2(props) { return h(D3, { theme: props.theme }); }
function D1(props) { return h(D2, { theme: props.theme }); }

const drilledChain = [D1, D2, D3, D4, D5, Leaf_drilled];
const mentionsDrilled = drilledChain.filter(fn => String(fn).includes("theme")).length;
const usesItDrilled = drilledChain.filter(fn => String(fn).includes("`theme=")).length;

const rd = createRenderer();
const drilledOut = rd.render(h(D1, { theme: "dark" }));

console.log("    components in the chain           :", drilledChain.length);
console.log("    components that MENTION `theme`   :", mentionsDrilled);
console.log("    components that actually USE it   :", usesItDrilled);
console.log("    components that are pure overhead :", mentionsDrilled - usesItDrilled);
console.log("    output                            :", JSON.stringify(drilledOut));
console.log("\n  Four of those files are typed, reviewed, tested and merged for a");
console.log("  value they do not read. Rename `theme` to `colorScheme` and you have");
console.log("  a six-file pull request. → 04_state-patterns/02_prop-drilling-problem.js\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE PROVIDER, AND WHAT NESTING ONE INSIDE ANOTHER MEANS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same chain, on a channel:\n");

const ThemeContext = createContext("light");

const rp = createRenderer();
function Leaf_ctx() { return h("button", null, `theme=${rp.useContext(ThemeContext)}`); }
function P5() { return h(Leaf_ctx, null); }
function P4() { return h(P5, null); }
function P3() { return h(P4, null); }
function P2() { return h(P3, null); }
function P1() { return h(P2, null); }

const ctxChain = [P1, P2, P3, P4, P5, Leaf_ctx];
const mentionsCtx = ctxChain.filter(fn => String(fn).includes("Theme")).length;

const ctxOut = rp.render(provide(ThemeContext, "dark", h(P1, null)));

console.log("    components that MENTION the theme:", mentionsCtx, "(the leaf) + 1 provider at the root");
console.log("    intermediate components changed  :", 0);
console.log("    output                           :", JSON.stringify(ctxOut));

// Nesting: a provider closest to the consumer WINS. This is what makes
// scoped overrides possible — a dark sidebar inside a light app.
const scoped = rp.render(
  provide(ThemeContext, "light", [
    h(Leaf_ctx, null),
    provide(ThemeContext, "dark", h(Leaf_ctx, null)),
  ])
);

console.log("\n    nested providers — <Provider light> [ leaf, <Provider dark> leaf ]:");
console.log("      →", JSON.stringify(scoped));
console.log("\n  The inner provider SHADOWS the outer one for its subtree only, and");
console.log("  the outer value is restored on the way out. That is not a special");
console.log("  feature — it is what a stack does, and it is why you can drop a");
console.log("  <ThemeProvider value=\"dark\"> around one panel and change nothing else.");
console.log("\n  It is also how the same context serves two independent instances of a");
console.log("  widget on one page: two <Tabs> = two providers = two states. → 01\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE INLINE VALUE BUG
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the one-line mistake that re-renders your whole app:\n");

// ❌  <AuthContext.Provider value={{ user, setUser }}>
//        ^ a NEW object every time the provider renders
// ✅  const value = useMemo(() => ({ user, setUser }), [user]);
//     <AuthContext.Provider value={value}>

const AuthContext = createContext(null);

function buildApp(renderer, valueFactory) {
  function Sidebar() { renderer.useContext(AuthContext); return h("aside", null, "sidebar"); }
  function Header() { renderer.useContext(AuthContext); return h("header", null, "header"); }
  function Footer() { renderer.useContext(AuthContext); return h("footer", null, "footer"); }
  renderer.memo("Sidebar", "Header", "Footer");   // all three are memoized ✅
  return tick => renderer.render(
    provide(AuthContext, valueFactory(tick), [h(Sidebar, null), h(Header, null), h(Footer, null)])
  );
}

const user = { id: 1, name: "Vineet" };
const setUser = () => {};

const rInline = createRenderer();
const renderInline = buildApp(rInline, () => ({ user, setUser }));   // 🐛 fresh object
for (let tick = 0; tick < 4; tick++) renderInline(tick);

const rStable = createRenderer();
const stableValue = { user, setUser };                                // ✅ stands in for useMemo
const renderStable = buildApp(rStable, () => stableValue);
for (let tick = 0; tick < 4; tick++) renderStable(tick);

console.log("    4 provider renders, 3 memoized consumers:");
console.log("      value={{ user, setUser }} → consumer renders:", rInline.total(), " skips:", rInline.skips(), "🐛");
console.log("      value={memoizedValue}     → consumer renders:", rStable.total(), " skips:", rStable.skips(), "✅");
console.log("\n  Every consumer is wrapped in React.memo in BOTH runs. It changes");
console.log("  nothing in the first one, because context is not a prop — it is a");
console.log("  subscription that sits above the prop check entirely.");
console.log("\n  And notice where the damage lands: not on the provider, which renders");
console.log("  4 times either way, but on every consumer in the application. One");
console.log("  object literal at the root is an app-wide render.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — CONTEXT IS ALL-OR-NOTHING
// ══════════════════════════════════════════════════════════════════

console.log("§6 — one fat provider vs three thin ones:\n");

// The natural first design: one <AppProvider> holding everything.
// The problem: React has no way to say "I only read value.cart". Any change to
// the value object wakes every consumer, whatever slice they read.

const AppContext = createContext(null);

const rFat = createRenderer();
function UserBadge_fat() { rFat.useContext(AppContext); return h("span", null, "badge"); }
function ThemeToggle_fat() { rFat.useContext(AppContext); return h("span", null, "toggle"); }
function CartIcon_fat() { rFat.useContext(AppContext); return h("span", null, "cart"); }
rFat.memo("UserBadge_fat", "ThemeToggle_fat", "CartIcon_fat");

for (let cartCount = 0; cartCount < 4; cartCount++) {
  // memoized on [user, theme, cart] — and `cart` changed, so it is a new object
  rFat.render(provide(AppContext, { user, theme: "dark", cart: { count: cartCount } },
    [h(UserBadge_fat, null), h(ThemeToggle_fat, null), h(CartIcon_fat, null)]));
}

// Split: three contexts, three providers. Only the cart value changes.
const UserCtx = createContext(null), ThemeCtx = createContext(null), CartCtx = createContext(null);

const rThin = createRenderer();
function UserBadge_thin() { rThin.useContext(UserCtx); return h("span", null, "badge"); }
function ThemeToggle_thin() { rThin.useContext(ThemeCtx); return h("span", null, "toggle"); }
function CartIcon_thin() { rThin.useContext(CartCtx); return h("span", null, "cart"); }
rThin.memo("UserBadge_thin", "ThemeToggle_thin", "CartIcon_thin");

const themeValue = "dark";
for (let cartCount = 0; cartCount < 4; cartCount++) {
  rThin.render(
    provide(UserCtx, user,
      provide(ThemeCtx, themeValue,
        provide(CartCtx, { count: cartCount },
          [h(UserBadge_thin, null), h(ThemeToggle_thin, null), h(CartIcon_thin, null)]))));
}

console.log("    4 cart updates, nothing else changed:");
console.log("      ONE fat context  → badge:", rFat.count("UserBadge_fat"),
  " toggle:", rFat.count("ThemeToggle_fat"), " cart:", rFat.count("CartIcon_fat"),
  " total:", rFat.total(), "🐛");
console.log("      THREE contexts   → badge:", rThin.count("UserBadge_thin"),
  " toggle:", rThin.count("ThemeToggle_thin"), " cart:", rThin.count("CartIcon_thin"),
  " total:", rThin.total(), "✅");
console.log("\n  Read the badge column. In the fat version a component that renders");
console.log("  the user's initials re-rendered four times because somebody added a");
console.log("  T-shirt to a basket. Nothing it reads changed.");
console.log("\n  The rule that falls out: SPLIT CONTEXTS BY UPDATE FREQUENCY, not by");
console.log("  domain tidiness. Values that change together belong together;");
console.log("  values that change on different clocks must not share a provider.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE STATE / DISPATCH SPLIT
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the trick that makes writers free:\n");

// Half the consumers of a store never READ it — they only write:
//   <AddToCartButton />  calls dispatch, renders nothing that depends on cart.
//
// If dispatch lives in the same value as the state, those components re-render
// on every state change for no reason at all. Split them:
//
//   <CartStateContext.Provider value={cart}>
//     <CartDispatchContext.Provider value={dispatch}>   // ← stable forever
//
// useReducer's dispatch is guaranteed stable across renders, so the dispatch
// context value never changes and its consumers never re-render.
// → 02_built-in-hooks/06_usereducer-vs-usestate.js

const CartStateCtx = createContext(null), CartDispatchCtx = createContext(null);

const rCombined = createRenderer();
function AddButton_combined() { rCombined.useContext(AppContext); return h("button", null, "add"); }
rCombined.memo("AddButton_combined");
for (let n = 0; n < 4; n++) {
  rCombined.render(provide(AppContext, { cart: { count: n }, dispatch: () => {} },
    h(AddButton_combined, null)));
}

const rSplit = createRenderer();
const dispatch = () => {};                     // stable identity, like useReducer's
function AddButton_split() { rSplit.useContext(CartDispatchCtx); return h("button", null, "add"); }
function CartCount_split() { rSplit.useContext(CartStateCtx); return h("span", null, "count"); }
rSplit.memo("AddButton_split", "CartCount_split");
for (let n = 0; n < 4; n++) {
  rSplit.render(
    provide(CartStateCtx, { count: n },
      provide(CartDispatchCtx, dispatch,
        [h(AddButton_split, null), h(CartCount_split, null)])));
}

console.log("    4 cart updates, a button that only WRITES:");
console.log("      state+dispatch in one value → AddButton rendered", rCombined.count("AddButton_combined"), "🐛");
console.log("      dispatch in its own context → AddButton rendered", rSplit.count("AddButton_split"), "✅");
console.log("      (the component that reads the count still renders", rSplit.count("CartCount_split"), "times — correctly)");
console.log("\n  This is the highest-value context refactor there is, and it costs one");
console.log("  extra provider. Every 'add to cart', 'toggle', 'open modal' button in");
console.log("  the app stops re-rendering, permanently.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — PROVIDER HELL, AND WHAT FLATTENING REALLY FIXES
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the wall at the top of every App.tsx:\n");

const providerNames = ["Theme", "Auth", "I18n", "Query", "Toast"];

const nested = providerNames
  .map((n, i) => "  ".repeat(i) + `<${n}Provider>`)
  .concat(["  ".repeat(providerNames.length) + "<App />"])
  .concat(providerNames.map((_, i) => "  ".repeat(providerNames.length - 1 - i) + `</${providerNames[providerNames.length - 1 - i]}Provider>`))
  .join("\n");

console.log(nested.split("\n").map(l => "      " + l).join("\n"));

// The usual "fix": compose them programmatically.
//
//   const providers = [ThemeProvider, AuthProvider, I18nProvider, QueryProvider, ToastProvider];
//   const Providers = ({ children }) =>
//     providers.reduceRight((acc, P) => <P>{acc}</P>, children);
//
//   <Providers><App /></Providers>
const sourceNestingBefore = providerNames.length;
const sourceNestingAfter = 1;
const runtimeLayersBefore = providerNames.length;
const runtimeLayersAfter = providerNames.length;   // ← unchanged. On purpose.

console.log("\n    source nesting  :", sourceNestingBefore, "→", sourceNestingAfter);
console.log("    runtime layers  :", runtimeLayersBefore, "→", runtimeLayersAfter, "← unchanged");

console.log("\n  Say that second line in an interview. Composing providers is a");
console.log("  READABILITY fix, not a performance fix — the same five providers still");
console.log("  render, in the same order, with the same subscriptions. Anyone who");
console.log("  claims it 'reduces re-renders' has not measured it.");
console.log("\n  What actually reduces the cost:");
console.log("    • push each provider DOWN to the smallest subtree that needs it —");
console.log("      a <ToastProvider> at the root wakes the whole app; around the");
console.log("      one layout that renders toasts, it wakes a layout");
console.log("    • split by update frequency (§6)");
console.log("    • separate state from dispatch (§7)");
console.log("    • memoize every value (§5)\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN CONTEXT IS THE WRONG TOOL
// ══════════════════════════════════════════════════════════════════

console.log("§9 — the frequency ceiling:\n");

// Context has no selector. Every consumer of a context re-renders on every
// value change, full stop. For a value that changes 60 times a second — mouse
// position, scroll offset, a controlled form's text, an animation frame —
// that is a re-render of every consumer, 60 times a second.

const MouseCtx = createContext({ x: 0, y: 0 });

const rHot = createRenderer();
function Crosshair() { rHot.useContext(MouseCtx); return h("div", null, "cross"); }
function Panel_a() { rHot.useContext(MouseCtx); return h("div", null, "panel"); }
function Panel_b() { rHot.useContext(MouseCtx); return h("div", null, "panel"); }
rHot.memo("Crosshair", "Panel_a", "Panel_b");

const FRAMES = 60;
for (let f = 0; f < FRAMES; f++) {
  rHot.render(provide(MouseCtx, { x: f, y: f },
    [h(Crosshair, null), h(Panel_a, null), h(Panel_b, null)]));
}

// An external store with selectors: only the component that reads x re-renders.
// This is what Zustand/Redux/useSyncExternalStore give you that context cannot.
let storeRenders = 0;
for (let f = 0; f < FRAMES; f++) {
  storeRenders += 1;                    // only <Crosshair> subscribes to `x`
}

console.log("    60 mouse moves, 3 memoized consumers, 1 of which needs the value:");
console.log("      context            → component renders:", rHot.total(), "🐛");
console.log("      store + selector   → component renders:", storeRenders, "✅");
console.log("      wasted renders     :", rHot.total() - storeRenders);
console.log("\n  Context is a broadcast; a store is a subscription with a filter.");
console.log("  → 02_built-in-hooks/14_usesyncexternalstore.js");
console.log("  → 04_state-patterns/08_zustand-basics.js");
console.log("\n  The dividing line, stated once: context for values read WIDELY and");
console.log("  changed RARELY; a store for values changed OFTEN and read NARROWLY.\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The whole app re-renders on every provider render:
//   value={{ … }} inline. The most common React performance bug there is.
//   → §5.
//
// Bug 2 — A memoized component re-renders anyway:
//   It reads context. memo filters props; context is a separate subscription.
//   → §5, and 05_optimization-techniques/01 §6.3.
//
// Bug 3 — "Cannot read properties of null":
//   A consumer rendered outside its provider, with createContext(null). Ship a
//   hook that throws a real sentence instead. → 01_compound-component-pattern.js §6.
//
// Bug 4 — Everything silently reads the DEFAULT value:
//   createContext({ user: null }) and a missing provider. No error, wrong UI.
//   The default value is a footgun, not a convenience.
//
// Bug 5 — Adding one item to a cart re-renders the user badge:
//   One fat context. Split by update frequency. → §6.
//
// Bug 6 — Buttons that only dispatch re-render constantly:
//   State and dispatch share a value. Split them. → §7.
//
// Bug 7 — Two widgets on a page share one state:
//   The state was module-scoped instead of provider-scoped. One provider
//   instance = one state. → §4.
//
// Bug 8 — Typing in a form re-renders the entire page:
//   Form state in a root-level context. Move it down, or use a form library
//   with subscriptions. → §9.
//
// Bug 9 — Provider order dependency:
//   <AuthProvider> reads from <QueryProvider> but sits above it. Providers are
//   a stack; order is a real dependency, and it fails at runtime only.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Prop drilling:
assert(mentionsDrilled === 6, "all six components mention `theme` 🐛");
assert(usesItDrilled === 1, "...exactly one of them renders it");
assert(mentionsDrilled - usesItDrilled === 5, "five files are pure transport");
assert(drilledOut.includes("theme=dark"), "the value did arrive, eventually");

// The provider:
assert(mentionsCtx === 1, "with context, only the leaf mentions the theme ✅");
assert(ctxOut.includes("theme=dark"), "...and it reads it from six levels up");
assert(JSON.stringify(scoped) === JSON.stringify(["<button>", "theme=light", "</button>", "<button>", "theme=dark", "</button>"]),
  "a nested provider shadows the outer value for its subtree only ✅");

// The inline value bug:
assert(rInline.total() === 12 && rInline.skips() === 0,
  "inline value object → 3 memoized consumers × 4 renders = 12 🐛");
assert(rStable.total() === 3 && rStable.skips() === 9,
  "a stable value → 3 renders and 9 skips ✅");

// All-or-nothing:
assert(rFat.total() === 12, "one fat context → every consumer wakes on every change 🐛");
assert(rFat.count("UserBadge_fat") === 4, "...including one that reads nothing that changed");
assert(rThin.total() === 6, "three contexts → 6 renders instead of 12 ✅");
assert(rThin.count("UserBadge_thin") === 1 && rThin.count("CartIcon_thin") === 4,
  "only the cart consumer follows the cart");

// State/dispatch split:
assert(rCombined.count("AddButton_combined") === 4,
  "a write-only button re-renders on every state change 🐛");
assert(rSplit.count("AddButton_split") === 1,
  "dispatch in its own context → it renders once, ever ✅");
assert(rSplit.count("CartCount_split") === 4, "...while the reader still updates correctly");

// Provider hell:
assert(sourceNestingBefore === 5 && sourceNestingAfter === 1,
  "composing providers flattens the SOURCE");
assert(runtimeLayersBefore === runtimeLayersAfter,
  "...and changes the RUNTIME not at all — it is a readability fix");

// The frequency ceiling:
assert(rHot.total() === 180, "60 frames × 3 context consumers = 180 renders 🐛");
assert(rHot.total() - storeRenders === 120, "120 of them were wasted; a selector removes them ✅");

console.log("§11 — mini assertions passed for: Provider Pattern");
console.log("\n  The pair that captures it: one object literal in `value` turned 3");
console.log("  renders into 12 with every consumer memoized — and splitting one fat");
console.log("  provider into three cut 12 to 6 while a dispatch-only context took a");
console.log("  write-only button from 4 renders to 1.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the provider pattern?", answer:
//
//   "A component publishes a value into a context so any descendant can read
//    it directly, instead of threading it through every component in between.
//    The classic case is theme, auth, locale or a dispatch function — a value
//    read in fifty places that would otherwise be drilled through five
//    components that never use it.
//
//    The part that matters at senior level is the cost model. A consumer
//    re-renders whenever the provider's value changes by Object.is — not when
//    the slice it reads changes, when the whole value does. React.memo does
//    not stop it, because context is a subscription that sits above the prop
//    check. So the first bug is always the inline value: value={{ user,
//    setUser }} creates a new object every provider render, and every consumer
//    in the app re-renders forever. useMemo it.
//
//    The second issue is that context has no selectors. One fat AppProvider
//    holding user, theme and cart means adding an item to the cart re-renders
//    the component showing the user's initials. So I split contexts by UPDATE
//    FREQUENCY rather than by domain — things that change on the same clock
//    belong together.
//
//    The highest-value single refactor is separating state from dispatch into
//    two providers. useReducer's dispatch is stable, so every write-only
//    component — every add-to-cart button, every toggle — stops re-rendering
//    entirely, at the cost of one extra provider.
//
//    On provider hell: I'd flatten App.tsx by reducing an array of providers,
//    but I'd be clear that it's a readability fix, not a performance one — the
//    same providers still render. What actually helps is pushing each provider
//    down to the smallest subtree that needs it.
//
//    And I'd name the ceiling: context is a broadcast, so it's wrong for
//    high-frequency values. Mouse position or a controlled form at the root
//    means every consumer re-renders on every frame or keystroke. That's when
//    you want an external store with selectors — Zustand, Redux, or
//    useSyncExternalStore — because a subscription with a filter is the thing
//    context structurally cannot be."
//
// The "split by update frequency" and "flattening is readability, not
// performance" lines are the two that mark experience.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. When does a context consumer re-render?
// A1. When the provider's value changes by Object.is. Not per-field.
//
// Q2. Does React.memo stop a context-driven re-render?
// A2. No. Context is a subscription, not a prop.
//
// Q3. Why memoize the value?
// A3. An object literal is a new reference every render, so every consumer
//     re-renders on every provider render.
//
// Q4. How do you split contexts?
// A4. By update frequency. Rarely-changing values in one, hot values in
//     another, dispatch on its own.
//
// Q5. Why is the state/dispatch split so effective?
// A5. dispatch from useReducer is stable, so its consumers never re-render —
//     and write-only components are usually half of them.
//
// Q6. Does composing providers improve performance?
// A6. No. Same providers, same renders. It improves the source only.
//
// Q7. Is context a state manager?
// A7. No — it is a transport. It has no store, no selectors, no middleware,
//     no devtools. Pair it with useReducer, or use a real store.
//
// Q8. When should you not use context?
// A8. High-frequency values, or when consumers need to read one field without
//     waking on the others. Use a store with selectors.
//
// Q9. What is the default value for?
// A9. Rendering a consumer with no provider — mostly a testing convenience,
//     and usually a footgun. Prefer null plus a throwing hook.
//
// Q10. Two <ThemeProvider> nested — which wins?
// A10. The nearest ancestor. The outer value is restored outside the inner
//      subtree, which is what makes scoped overrides work.
//
// Q11. Does a provider re-render its children when the value is unchanged?
// A11. Children re-render because the PROVIDER re-rendered (normal parent
//      rule), not because of context. Passing children through props — or
//      memoizing them — avoids it.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Provider pattern, in one line?
//   Back : One writer publishes a value; every descendant can read it with no
//          props.
//
// Flashcard 2:
//   Front: When does a consumer re-render?
//   Back : When the value changes by Object.is. Whole value, not per-field.
//
// Flashcard 3:
//   Front: The #1 provider bug?
//   Back : value={{…}} inline → new reference every render → app-wide render.
//
// Flashcard 4:
//   Front: How do you split contexts?
//   Back : By update frequency, not by domain.
//
// Flashcard 5:
//   Front: State/dispatch split — why?
//   Back : dispatch is stable, so write-only components never re-render.
//
// Flashcard 6:
//   Front: Does flattening provider hell help performance?
//   Back : No. Readability only.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Context is a broadcast, a store is a subscription with a filter.
//          Widely read and rarely changed → context. Often changed and
//          narrowly read → store."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Drill a value through five components, then replace it with a provider.
//   Diff the two branches and count the changed files.
//
// Task 2:
//   Put an inline object in `value`, log renders in three memoized consumers,
//   then useMemo it. You should see 12 → 3.
//
// Task 3:
//   Nest two <ThemeProvider>s and prove the inner one shadows the outer one
//   for its subtree only.
//
// Task 4:
//   Build one fat AppContext, then split it into three. Update one slice and
//   count renders before and after.
//
// Task 5:
//   Split state and dispatch. Log renders in a button that only dispatches.
//   The number should be 1.
//
// Task 6:
//   Put mouse position in context and move the mouse across the page with the
//   Profiler recording. Then move it into Zustand with a selector.
//
// Task 7:
//   Take your app's root provider stack and push each provider down to the
//   smallest subtree that needs it. Measure the root render count.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Every consumer re-renders when the VALUE changes by reference — not when
//   the field it reads changes. Memoize the value.
//
// If you remember the common bug:
//   value={{ … }} written inline. Three memoized consumers, four renders,
//   twelve wasted renders.
//
// If you remember the professional framing:
//   Providers are an architecture decision, not an API call. Split by update
//   frequency, separate state from dispatch, push each provider down to the
//   subtree that needs it — and reach for a store the moment the value changes
//   faster than the readers care about.
//
// NEXT TOPIC -> 06_observer-pattern.js
