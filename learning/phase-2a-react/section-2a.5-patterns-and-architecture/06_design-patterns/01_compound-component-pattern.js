// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  01_compound-component-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Compound Component Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. The problem it solves: the prop explosion of a "configurable" component
//   2. cloneElement vs context — and the exact tree that breaks cloneElement
//   3. Implicit state sharing: the parent owns state, children never see props
//   4. The invariant every compound child needs (and the error it must throw)
//   5. Namespacing (Tabs.List) — what it buys and what it costs
//   6. Inversion of layout control, proven with three layouts and zero new props
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/01_compound-component-pattern.js"
//
// Prerequisites: 02_built-in-hooks/04_usecontext-use-case.js and
// 04_state-patterns/03_context-api-provider-pattern.js. This file is the first
// real ANSWER to "what is context actually for" — a private channel inside one
// component family, not an app-wide store.
//
// This is the first file of Section 2A.5. The whole section is one question:
// once a component works, how do you shape its API so other people can use it?
// 01 gives the first answer — hand the layout back to the caller.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Compound Component Pattern:
// A set of components that are useless alone and meaningful together, sharing
// state IMPLICITLY through context instead of through props.
//
//   <Tabs defaultId="a">
//     <Tabs.List>
//       <Tabs.Tab id="a">Account</Tabs.Tab>
//       <Tabs.Tab id="b">Billing</Tabs.Tab>
//     </Tabs.List>
//     <Tabs.Panel id="a">…</Tabs.Panel>
//     <Tabs.Panel id="b">…</Tabs.Panel>
//   </Tabs>
//
// If interviewer says "explain it simply", say:
// "It's the <select>/<option> relationship, in React. <option> makes no sense
//  outside a <select>, and you never pass the selected value to each <option> —
//  the parent knows it. A compound component does the same thing: the parent
//  owns the state, the children read it from context, and the CALLER owns the
//  markup in between."
//
// If interviewer asks "why does it matter?", say:
// "Because the alternative is a component with forty props. Every new visual
//  requirement adds a prop, a renderX callback, or a boolean, and the component
//  slowly becomes a bad templating language. Compound components invert that:
//  the consumer writes the layout, and the component only owns behaviour."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   IMPLICIT STATE SHARING — the children get state they never asked for.
//
// Runtime rule:
//   The parent renders a Provider. Every child, at ANY depth, calls useContext
//   during its own render and reads the current value. There is no prop chain,
//   so the depth of the tree between parent and child does not matter.
//
// Practical rule:
//   Use it when the consumer must control ORDER and LAYOUT but must not control
//   STATE. Tabs, Accordion, Select, Menu, Dialog, Table, Form field groups.
//
// Common trap:
//   Reaching for React.Children.map + cloneElement instead of context. It works
//   in the demo, where children are direct, and breaks the first time somebody
//   wraps a child in a <div> or a <Tooltip>. That is §4, and it is the single
//   most common wrong implementation of this pattern.
//
// The mental picture:
//
//   config-prop component            compound component
//   ─────────────────────            ──────────────────
//   caller passes DATA               caller passes MARKUP
//   component owns markup            component owns behaviour
//   new design → new prop            new design → caller rearranges children
//   props: 4 → 13 → 30               props: stays small


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM: THE PROP EXPLOSION
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what a 'configurable' component becomes:\n");

// v1 of a perfectly reasonable Tabs component:
//   <Tabs items={items} activeId={id} onChange={setId} className="…" />
const v1 = ["items", "activeId", "onChange", "className"];

// Then design asks for things. Each request is real; none is unreasonable.
const featureRequests = [
  ["icons next to labels", ["renderIcon", "iconPosition"]],
  ["a badge with a count", ["renderBadge", "badgeVariant"]],
  ["a vertical variant", ["orientation"]],
  ["panels mounted lazily", ["lazy", "keepMounted"]],
  ["a divider between tabs", ["divider", "dividerColor"]],
];

const configProps = [...v1];
for (const [request, added] of featureRequests) {
  configProps.push(...added);
  console.log(`    "${request}" → +${added.length} props  (total ${configProps.length})`);
}

console.log("\n    started with:", v1.length, "props →  ended with:", configProps.length);
console.log("\n  And notice WHAT was added: renderIcon, renderBadge — the component");
console.log("  is now asking the caller to pass it markup through a keyhole. Every");
console.log("  one of those props exists because the component owns the layout and");
console.log("  the caller does not. Give the layout back and all 9 disappear.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — ATTEMPT 1: React.Children.map + cloneElement (IT BREAKS)
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the implementation everybody writes first:\n");

// ❌ The tempting version:
//
//   function Tabs({ children, defaultId }) {
//     const [activeId, setActiveId] = useState(defaultId);
//     return React.Children.map(children, child =>
//       React.cloneElement(child, { activeId, setActiveId })
//     );
//   }
//
// React.Children.map walks ONE level. cloneElement injects props into the
// elements it is handed — and only those.

// ── a 40-line React, enough to prove everything in this file ───────
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
function useContext(ctx) {
  return ctx._stack[ctx._stack.length - 1];
}
function provide(ctx, value, children) {
  return { type: PROVIDER, props: { ctx, value, children } };
}

function createRenderer() {
  const counts = {};
  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props } = node;
    if (type === PROVIDER) {
      props.ctx._stack.push(props.value);
      const out = render(props.children);
      props.ctx._stack.pop();          // ← scoped exactly like a real Provider
      return out;
    }
    if (typeof type === "function") {
      counts[type.name] = (counts[type.name] || 0) + 1;
      return render(type(props));
    }
    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }
  return { render, count: n => counts[n] || 0 };
}

// React.Children.map — one level, exactly like the real one:
function childrenMap(children, fn) {
  const list = Array.isArray(children) ? children : children ? [children] : [];
  return list.map(fn);
}
function cloneElement(el, extra) {
  return { type: el.type, props: { ...el.props, ...extra } };
}

// The cloneElement Tabs:
const injected = [];                    // every Tab records what it received
function CloneTab(props) {
  injected.push(props.activeId !== undefined);
  return props.children;
}
function CloneTabs(props) {
  return childrenMap(props.children, child => cloneElement(child, { activeId: "a" }));
}

const r1 = createRenderer();

// Case A — flat children. The demo. It works.
r1.render(
  h(CloneTabs, null,
    h(CloneTab, { id: "a" }, "Account"),
    h(CloneTab, { id: "b" }, "Billing"),
    h(CloneTab, { id: "c" }, "Team"))
);
const flatOk = injected.filter(Boolean).length;
console.log("    flat children      → Tabs that received activeId:", flatOk, "/ 3 ✅");

// Case B — one <div> for styling. The first real design change.
injected.length = 0;
r1.render(
  h(CloneTabs, null,
    h("div", { className: "row" },
      h(CloneTab, { id: "a" }, "Account"),
      h(CloneTab, { id: "b" }, "Billing"),
      h(CloneTab, { id: "c" }, "Team")))
);
const wrappedOk = injected.filter(Boolean).length;
console.log("    wrapped in a <div> → Tabs that received activeId:", wrappedOk, "/ 3 🐛");
console.log("\n  The <div> got `activeId`. A DOM node does not care about activeId,");
console.log("  and React will warn that it is an unknown attribute. The three Tabs");
console.log("  that DO care got nothing, and rendered as if nothing was selected.");
console.log("\n  Every extra failure mode of cloneElement, for free:");
console.log("    • a child wrapped in <Tooltip> or <motion.div>  → broken");
console.log("    • {condition && <Tab/>}  → `false` in the array, cloneElement throws");
console.log("    • a caller who maps over data → nested arrays, one more level");
console.log("    • injected props silently OVERWRITE the caller's own props");
console.log("    • TypeScript cannot type it — the child's props are unknown\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FIX: CONTEXT. DEPTH STOPS MATTERING.
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the same tree, with context:\n");

const TabsContext = createContext(null);

function useTabs(componentName) {
  const ctx = useContext(TabsContext);
  if (ctx === null) {
    // ✅ The invariant. §6 explains why this line is not optional.
    throw new Error(`<${componentName}> must be rendered inside <Tabs>`);
  }
  return ctx;
}

const seen = [];
function Tab(props) {
  const { activeId } = useTabs("Tabs.Tab");
  seen.push({ id: props.id, active: props.id === activeId });
  return props.children;
}
function Panel(props) {
  const { activeId } = useTabs("Tabs.Panel");
  return props.id === activeId ? props.children : null;
}
function Tabs(props) {
  // In real React: const [activeId, setActiveId] = useState(props.defaultId)
  const value = { activeId: props.defaultId, setActiveId: () => {} };
  return provide(TabsContext, value, props.children);
}

const r2 = createRenderer();
const out = r2.render(
  h(Tabs, { defaultId: "b" },
    h("div", { className: "row" },
      h("div", { className: "inner" },              // depth 3, on purpose
        h(Tab, { id: "a" }, "Account"),
        h(Tab, { id: "b" }, "Billing"),
        h(Tab, { id: "c" }, "Team"))),
    h(Panel, { id: "a" }, "ACCOUNT PANEL"),
    h(Panel, { id: "b" }, "BILLING PANEL"),
    h(Panel, { id: "c" }, "TEAM PANEL"))
);

const tabsSeen = seen.slice();          // snapshot: §8 renders more Tabs below

console.log("    Tabs that read the shared state:", tabsSeen.length, "/ 3 ✅  (two <div>s deep)");
console.log("    which one is active            :", tabsSeen.find(t => t.active).id);
console.log("    panels actually rendered       :", out.filter(s => s.endsWith("PANEL")).length, "/ 3 ✅");
console.log("    rendered output                :", JSON.stringify(out.filter(s => s.endsWith("PANEL"))));
console.log("\n  Nothing was injected into anything. Each Tab asked for the value");
console.log("  itself, during its own render. That is why the two wrapper <div>s");
console.log("  are invisible to the pattern — and why the caller can now put");
console.log("  ANYTHING between <Tabs> and <Tabs.Tab>.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE INVARIANT: FAIL LOUDLY, NOT SILENTLY
// ══════════════════════════════════════════════════════════════════

console.log("§6 — a compound child used alone:\n");

// The default context value decides what a misuse feels like.
//
//   createContext({})    → child reads `undefined`, renders wrong, NO error 🐛
//   createContext(null)  → child throws a sentence naming both components ✅
//
// This is the difference between a library people like and a library people
// file bugs against. A silent wrong render is the worst failure mode in UI.

const r3 = createRenderer();
let thrown = null;
try {
  r3.render(h(Tab, { id: "a" }, "Account"));   // no <Tabs> anywhere
} catch (e) {
  thrown = e.message;
}
console.log("    rendering <Tabs.Tab> outside <Tabs>:");
console.log("      threw:", JSON.stringify(thrown));
console.log("\n  Note what the message contains: the child's name AND the parent it");
console.log("  needs. The developer does not have to read your source to fix it.");
console.log("  Ship the custom hook (useTabs), never the raw context.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — NAMESPACING: Tabs.List, Tabs.Tab, Tabs.Panel
// ══════════════════════════════════════════════════════════════════

console.log("§7 — attaching the family to its parent:\n");

function List(props) { return props.children; }

Tabs.List = List;
Tabs.Tab = Tab;
Tabs.Panel = Panel;

console.log("    typeof Tabs.List :", typeof Tabs.List);
console.log("    typeof Tabs.Tab  :", typeof Tabs.Tab);
console.log("    typeof Tabs.Panel:", typeof Tabs.Panel);
console.log("    one import gives the caller:", Object.keys(Tabs).length, "components");

// What it buys:
//   • one import instead of four
//   • the relationship is visible at the call site — <Tabs.Panel> cannot be
//     mistaken for some other Panel
//   • autocomplete after "Tabs." documents the whole API
//
// What it costs — say this and you sound like you have shipped a library:
//   • BUNDLERS CANNOT TREE-SHAKE IT. `Tabs.Panel = Panel` is a mutation of an
//     object at module scope, so a bundler must keep every attached component
//     even if the app only uses <Tabs.Tab>. Named exports tree-shake; static
//     properties do not.
//   • React DevTools shows the inner function name, so set displayName:
//         Tab.displayName = "Tabs.Tab";
//   • React.lazy() cannot lazy-load a property of a component.
//
// The modern compromise, used by Radix and shadcn/ui: export BOTH. Named
// exports for the bundler, an attached object for ergonomics.


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT THE PATTERN ACTUALLY BUYS: LAYOUT INVERSION
// ══════════════════════════════════════════════════════════════════

console.log("§8 — three layouts, zero new props:\n");

const r4 = createRenderer();
let propsAdded = 0;               // we are going to add exactly none

// Layout 1 — the standard one.
const layout1 = r4.render(
  h(Tabs, { defaultId: "a" },
    h(Tabs.List, null, h(Tabs.Tab, { id: "a" }, "A"), h(Tabs.Tab, { id: "b" }, "B")),
    h(Tabs.Panel, { id: "a" }, "PANEL-A"))
);

// Layout 2 — panels ABOVE the tab strip. Impossible with a config-prop API
// unless somebody adds a `tabsPosition` prop.
const layout2 = r4.render(
  h(Tabs, { defaultId: "a" },
    h(Tabs.Panel, { id: "a" }, "PANEL-A"),
    h(Tabs.List, null, h(Tabs.Tab, { id: "a" }, "A"), h(Tabs.Tab, { id: "b" }, "B")))
);

// Layout 3 — a search box, a divider and a badge inside the strip, plus the
// whole thing inside somebody's design-system <Card>. Needs `renderBadge`,
// `divider`, `dividerColor` and a `header` slot in the config-prop version —
// that is four of the nine props from §3, gone.
const layout3 = r4.render(
  h(Tabs, { defaultId: "b" },
    h("Card", null,
      h(Tabs.List, null,
        h("SearchBox", null),
        h(Tabs.Tab, { id: "a" }, "A"),
        h("hr", null),
        h(Tabs.Tab, { id: "b" }, "B", h("Badge", null, "3"))),
      h(Tabs.Panel, { id: "b" }, "PANEL-B")))
);

console.log("    layout 1 output:", JSON.stringify(layout1.filter(s => s.startsWith("PANEL"))));
console.log("    layout 2 output:", JSON.stringify(layout2.filter(s => s.startsWith("PANEL"))));
console.log("    layout 3 output:", JSON.stringify(layout3.filter(s => s.startsWith("PANEL"))));
console.log("    new props added to Tabs to support all three:", propsAdded);
console.log("\n  Layout 2 reorders the component. Layout 3 injects three foreign");
console.log("  components INTO the tab strip and wraps everything in a Card. The");
console.log("  Tabs source code did not change, and its prop list did not grow.");
console.log("\n  That is the whole sales pitch: the component keeps the behaviour");
console.log("  (which tab is active, keyboard nav, aria wiring) and the caller keeps");
console.log("  the markup. Neither side has to negotiate with the other.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — THE COST, AND WHEN NOT TO USE IT
// ══════════════════════════════════════════════════════════════════
//
// Compound components are not free:
//
//   1. MORE SURFACE. Four exported components instead of one, four sets of
//      docs, four ways to be misused. The §6 invariant is mandatory, not nice.
//
//   2. THE CALLER CAN BUILD SOMETHING INVALID. <Tabs.Panel id="z"> with no
//      matching Tab renders nothing, silently. A config-prop API cannot express
//      that mistake. You are trading safety for flexibility on purpose.
//
//   3. ACCESSIBILITY GETS HARDER. role="tablist"/"tab"/"tabpanel",
//      aria-controls, aria-selected, roving tabindex, arrow-key navigation —
//      all of it must be wired through context by id, because you no longer
//      control the DOM structure. This is the real work of the pattern, and it
//      is why headless libraries exist. → 11_headless-components.js
//
//   4. EVERY CONSUMER RE-IMPLEMENTS THE COMMON CASE. If 90% of call sites
//      write the same 12 lines, you gave them a construction kit when they
//      wanted a component.
//
// So: DO NOT reach for it when the component has one layout and always will
// (a Button, a Badge, an Avatar). The honest answer in an interview is that
// most teams ship BOTH — the compound API for the 10%, and a thin
// config-prop wrapper built on top of it for the 90%:
//
//   export function SimpleTabs({ items, ...rest }) {
//     return (
//       <Tabs {...rest}>
//         <Tabs.List>{items.map(i => <Tabs.Tab key={i.id} id={i.id}>{i.label}</Tabs.Tab>)}</Tabs.List>
//         {items.map(i => <Tabs.Panel key={i.id} id={i.id}>{i.content}</Tabs.Panel>)}
//       </Tabs>
//     );
//   }
//
// The wrapper is 8 lines and cannot exist in the other direction — you cannot
// build a compound API on top of a config-prop one.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "It works in Storybook, breaks in the app":
//   cloneElement implementation; the app wrapped a child in a styled div.
//   → §4. Fix: context.
//
// Bug 2 — "React does not recognize the `activeId` prop on a DOM element":
//   cloneElement injected a prop into a host element. → §4.
//
// Bug 3 — "Cannot read properties of null (reading 'activeId')":
//   A compound child rendered outside its parent, with createContext(null) and
//   no guard. The message names the wrong thing entirely. → §6.
//
// Bug 4 — Nothing renders and nothing errors:
//   createContext({}) instead of null. activeId is undefined, no id matches,
//   every Panel returns null. The silent version of Bug 3. → §6.
//
// Bug 5 — "Tabs.Panel is not a component" after a refactor:
//   Someone changed `export default Tabs` to named exports and the attached
//   properties were lost. → §7.
//
// Bug 6 — The bundle grew by 40KB after adding one <Tabs.Tab>:
//   Static properties are not tree-shakeable. → §7.
//
// Bug 7 — Every child re-renders on every keystroke elsewhere in the page:
//   The context value is an object literal created during Tabs' render, so it
//   is a new reference each time. Memoize it.
//   → 05_optimization-techniques/02_referential-equality-problem.js
//
// Bug 8 — Two <Tabs> on one page share a selection:
//   The state was hoisted to a module-level variable instead of useState.
//   Context is per-Provider; module state is per-page. → §5.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The problem:
assert(v1.length === 4, "the reasonable v1 API had 4 props");
assert(configProps.length === 13, "five design requests later it has 13 🐛");

// cloneElement:
assert(flatOk === 3, "cloneElement injects into DIRECT children — the demo works ✅");
assert(wrappedOk === 0, "one wrapping <div> and it injects into NONE of them 🐛");

// Context:
assert(tabsSeen.length === 3, "context reaches every Tab regardless of depth ✅");
assert(tabsSeen.filter(t => t.active).length === 1, "exactly one tab is active");
assert(tabsSeen.find(t => t.active).id === "b", "defaultId='b' → the 'b' tab is active");
assert(out.filter(s => s.endsWith("PANEL")).length === 1,
  "only the matching Panel renders its children");
assert(out.includes("BILLING PANEL"), "...and it is the right one");

// The invariant:
assert(thrown === "<Tabs.Tab> must be rendered inside <Tabs>",
  "a compound child must throw a message naming BOTH components ✅");

// Namespacing:
assert(typeof Tabs.List === "function" && typeof Tabs.Panel === "function",
  "sub-components attach as static properties");
assert(Object.keys(Tabs).length === 3, "one import, three components");

// Layout inversion — the point of the whole file:
assert(propsAdded === 0, "three different layouts cost ZERO new props ✅");
assert(layout1.includes("PANEL-A") && layout2.includes("PANEL-A"),
  "reordering Panel above List changes nothing about behaviour");
assert(layout3.includes("PANEL-B"), "foreign components inside the tab strip: still fine");
assert(JSON.stringify(layout1) !== JSON.stringify(layout3),
  "...and the three outputs really are different trees");

console.log("§11 — mini assertions passed for: Compound Component Pattern");
console.log("\n  The pair that captures it: a config-prop API went 4 props → 13 in");
console.log("  five design requests, while the compound API absorbed three layout");
console.log("  changes with 0. And cloneElement injected 3/3 props in the demo and");
console.log("  0/3 the moment a <div> appeared.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the compound component pattern?", answer:
//
//   "It's a group of components that only make sense together and share state
//    implicitly through context instead of props — <select> and <option>, in
//    React. The parent owns the state; the children read it themselves during
//    their own render; and the caller owns everything in between.
//
//    The reason to reach for it is prop explosion. A configurable Tabs starts
//    at four props, and then design wants icons, badges, a vertical variant,
//    lazy panels, a divider — and you're at thirteen, half of them renderX
//    callbacks that exist only to pass markup through a keyhole. Compound
//    components invert that: the component keeps the behaviour, the caller
//    writes the markup, and the prop list stops growing.
//
//    The implementation detail I'd flag is that most people write it with
//    React.Children.map and cloneElement, and that's a trap. It only walks one
//    level, so it works in the demo with flat children and breaks the first
//    time somebody wraps a child in a styling div — the div receives the
//    injected prop, React warns about an unknown DOM attribute, and the actual
//    children get nothing. Conditional children put `false` in the array and
//    cloneElement throws on it. Context has none of those problems because the
//    child asks for the value itself, so depth is irrelevant.
//
//    Two things I always ship with it. First, a custom hook — useTabs — that
//    reads the context and throws '<Tabs.Tab> must be used inside <Tabs>' when
//    it's null, because the default value decides whether misuse is a clear
//    error or a silent wrong render, and a silent wrong render is the worst
//    failure mode in UI. Second, memoize the context value, or every child
//    re-renders on every parent render.
//
//    The cost is real: more API surface, the caller can compose something
//    invalid, and accessibility gets harder because you no longer control the
//    DOM — the tablist/tab/tabpanel roles and roving tabindex all have to be
//    wired through context by id. So I wouldn't use it for a Button. In
//    practice I ship both: the compound API underneath, and a thin
//    config-prop wrapper on top for the 90% of call sites that just want the
//    default layout. That wrapper is eight lines, and it can't be built in the
//    other direction."
//
// The cloneElement critique and the "ship both" ending are what make this
// senior. Anyone can name the pattern.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. cloneElement or context?
// A1. Context. cloneElement only reaches direct children, so any wrapper
//     element breaks it, and it silently overwrites props the caller set.
//
// Q2. Why does React.Children.map not go deeper?
// A2. Because children is a prop holding element DESCRIPTIONS, not a rendered
//     tree. React has not rendered the div yet, so its children are inside its
//     own props — invisible to the parent. Recursing would mean re-implementing
//     the renderer.
//
// Q3. What should createContext's default value be?
// A3. null, plus a hook that throws. A real default makes misuse silent.
//
// Q4. How do you keep the children from re-rendering constantly?
// A4. useMemo the context value and useCallback the setters — otherwise the
//     value is a new object every parent render and every consumer wakes up.
//
// Q5. How does the caller control which tab is selected?
// A5. Support both: uncontrolled via defaultId with internal useState, and
//     controlled via value + onChange. → 12_controlled-component-design.js
//
// Q6. Does Tabs.Tab tree-shake?
// A6. No. Static properties are runtime mutations, so bundlers keep them all.
//     Export named components too.
//
// Q7. How do you handle accessibility?
// A7. Generate ids in context (useId), wire aria-controls/aria-labelledby by
//     id, implement roving tabindex and arrow keys in the List. This is most
//     of the work, and the reason headless libraries win.
//
// Q8. Is this pattern still relevant with hooks?
// A8. Yes — they solve different problems. Hooks share LOGIC between unrelated
//     components; compound components share STATE between related ones and
//     hand layout to the caller. Radix, Headless UI and shadcn/ui are all
//     hooks-era libraries built entirely on this pattern.
//
// Q9. What if a child must be a direct child (like <option>)?
// A9. Then validate at runtime through context — have the parent expose a
//     registration function the child calls, and warn on unexpected shapes.
//     Do not try to enforce structure with cloneElement.
//
// Q10. When would you refuse to use it?
// A10. When the component has exactly one layout forever, or when 90% of call
//      sites would copy the same boilerplate. Give those a wrapper.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Compound component, in one line?
//   Back : Components useless alone, sharing state implicitly via context,
//          with layout owned by the caller. <select>/<option>.
//
// Flashcard 2:
//   Front: Why not React.Children.map + cloneElement?
//   Back : One level deep. Any wrapper element breaks it, and it overwrites
//          the caller's props.
//
// Flashcard 3:
//   Front: What is the default context value?
//   Back : null — with a hook that throws a message naming both components.
//
// Flashcard 4:
//   Front: What problem does it solve?
//   Back : Prop explosion. 4 props → 13, half of them renderX callbacks.
//
// Flashcard 5:
//   Front: What does Tabs.Panel = Panel cost?
//   Back : Tree-shaking. Static properties are runtime mutations.
//
// Flashcard 6:
//   Front: What is the hidden work of this pattern?
//   Back : Accessibility. You gave away the DOM, so aria must travel through
//          context by id.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Ship both — the compound API underneath, a config-prop wrapper on
//          top. The wrapper only builds in that direction."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build <Accordion> as a compound component: Accordion, Accordion.Item,
//   Accordion.Header, Accordion.Panel. State: which item is open.
//
// Task 2:
//   Implement it FIRST with cloneElement. Then wrap one item in a <div> and
//   watch it break. Keep the broken version as a note to yourself.
//
// Task 3:
//   Add the invariant hook. Render <Accordion.Panel> alone and read the error
//   message you wrote. Is it good enough for a stranger?
//
// Task 4:
//   Make the context value memoized, then log a render count in each child and
//   prove the count drops.
//
// Task 5:
//   Support both uncontrolled (defaultOpenId) and controlled (openId+onChange)
//   in the same component. Then read 12_controlled-component-design.js and
//   check your work.
//
// Task 6:
//   Add full keyboard support: arrow keys move focus, Home/End jump, Enter
//   activates. Notice how much of it has to go through context.
//
// Task 7:
//   Write the 8-line config-prop wrapper on top of your compound API. Then try
//   to write a compound API on top of a config-prop one and see why it cannot
//   be done.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The parent owns the STATE, the caller owns the MARKUP, and context is the
//   wire between them.
//
// If you remember the common bug:
//   cloneElement walks one level. It works until somebody adds a <div>.
//
// If you remember the professional framing:
//   This pattern is a trade: you give away control of the DOM to stop the prop
//   list from growing. That trade costs you accessibility wiring and lets the
//   caller build something invalid — so ship a thin config-prop wrapper for the
//   common case and keep the compound API for the 10% that need it.
//
// NEXT TOPIC -> 02_render-props-pattern.js
