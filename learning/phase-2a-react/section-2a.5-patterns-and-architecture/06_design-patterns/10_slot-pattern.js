// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  10_slot-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Slot Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. Slots vs compound components: who owns ORDER, who owns CONTENT
//   2. The three spellings — element props, child-type detection, Slot/asChild
//   3. Why child-type detection breaks (the same wrapper bug as 01)
//   4. Empty slots: defaults, and collapsing the layout instead of leaving holes
//   5. The free performance win: an element prop is created by the CALLER
//   6. asChild — merging your behaviour onto someone else's element
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/10_slot-pattern.js"
//
// Prerequisites: 01_compound-component-pattern.js (the sibling answer) and
// 09_forwarding-refs.js — §7's asChild is unbuildable without ref forwarding.
//
// 01 handed the caller the whole layout. This file keeps the layout and hands
// out labelled holes. Both are "the caller supplies markup"; they differ on
// exactly one question, and that question is the interview answer.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Slot Pattern:
// A component defines NAMED HOLES in a layout it owns, and the caller fills
// them with elements.
//
//   <PageLayout
//     header={<SiteHeader />}
//     sidebar={<Nav />}
//     footer={<Footer />}
//   >
//     <Article />          {/* the default slot: children */}
//   </PageLayout>
//
// The name comes from Web Components' <slot name="header"> and Vue's named
// slots. React has no slot API — `children` is one slot, and every other prop
// that happens to hold an element is another.
//
// If interviewer says "explain it simply", say:
// "children is a hole in your component that the caller fills. A slot is the
//  same idea with a name, so you can have more than one — header, footer,
//  actions — while the component keeps control of where each hole sits."
//
// If interviewer asks "why does it matter?", say:
// "Because it separates layout from content. The component owns the grid, the
//  spacing and the order — which is the part a design system exists to
//  enforce — and the caller owns what goes in each region. Compound components
//  give away the order too; slots deliberately do not. And there's a free
//  performance property: an element passed as a prop was created by the
//  caller, so when the layout component re-renders, that element is the same
//  object and React skips it."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   NAMED CHILDREN. `children` is just the slot that needed no name.
//
// Runtime rule:
//   An element in a prop is an ordinary value — an object created at the CALL
//   SITE. The receiving component decides where to place it, whether to place
//   it at all, and what to render instead when it is missing.
//
// Practical rule:
//   Use slots when the component must guarantee the arrangement: a Card whose
//   header is always 48px and always above the body; a Dialog whose actions
//   are always bottom-right; a Table whose toolbar is always above the scroll
//   container.
//
// Common trap:
//   Reading child.type to sort children into slots. It works with flat
//   children and breaks the first time somebody wraps one — the same failure
//   as 01 §4, for the same reason.
//
// The mental picture:
//
//   compound component            slot pattern
//   ──────────────────            ────────────
//   caller writes the layout      component writes the layout
//   order is the caller's         order is guaranteed
//   <Tabs.List> anywhere          header is ALWAYS above body
//   maximum flexibility           maximum consistency
//   design system: the primitive  design system: the product


// ══════════════════════════════════════════════════════════════════
// § 3 — SPELLING 1: ELEMENTS AS PROPS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the layout stays put, the content changes:\n");

// ── a small React ─────────────────────────────────────────────────
function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}

function createRenderer() {
  const counts = {};
  const prevElement = {};
  let skips = 0;
  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props } = node;
    if (typeof type === "function") {
      const name = type.name;
      // React's element-identity bailout: the SAME element object at the same
      // position means nothing below it can have changed. §6 depends on this.
      if (prevElement[name] === node) { skips++; return prevElement[name + ":out"]; }
      prevElement[name] = node;
      counts[name] = (counts[name] || 0) + 1;
      const out = render(type(props));
      prevElement[name + ":out"] = out;
      return out;
    }
    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }
  return { render, count: n => counts[n] || 0, skips: () => skips,
           total: () => Object.values(counts).reduce((a, b) => a + b, 0) };
}

// The component owns the arrangement. Note that nothing here can be reordered
// by a caller — that is the point.
function Card(props) {
  return h("article", null, [
    props.header ? h("header", null, props.header) : null,
    h("div", { className: "body" }, props.children),
    props.footer ? h("footer", null, props.footer) : null,
  ]);
}

function Title() { return h("h2", null, "Invoice #204"); }
function Actions() { return h("button", null, "Download"); }
function Body() { return h("p", null, "Due in 3 days"); }

const r1 = createRenderer();
const filled = r1.render(h(Card, { header: h(Title, null), footer: h(Actions, null) }, h(Body, null)));

console.log("    <Card header={<Title/>} footer={<Actions/>}><Body/></Card>");
console.log("      →", JSON.stringify(filled));

// Swap the content entirely; the structure is byte-identical.
function OtherTitle() { return h("h2", null, "Receipt"); }
const swapped = r1.render(h(Card, { header: h(OtherTitle, null), footer: h(Actions, null) }, h(Body, null)));
const shapeOf = out => out.filter(s => s.startsWith("<")).join("");

console.log("\n    same Card, different content →", JSON.stringify(shapeOf(swapped)));
console.log("    structure identical to the first:", shapeOf(filled) === shapeOf(swapped), "✅");
console.log("\n  That is the guarantee a design system is selling. With compound");
console.log("  components the caller could put the footer above the header; with");
console.log("  slots they cannot, and every Card in the product lines up.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — SPELLING 2: CHILD-TYPE DETECTION (AND WHY IT BREAKS)
// ══════════════════════════════════════════════════════════════════

console.log("§4 — sorting children by their type:\n");

// The nicer-looking API:
//
//   <Card>
//     <Card.Header><Title/></Card.Header>
//     <Card.Footer><Actions/></Card.Footer>
//     <Body/>
//   </Card>
//
// Implemented by walking children and matching child.type:

function Header(props) { return props.children; }
function Footer(props) { return props.children; }

function collectSlots(children) {
  const list = Array.isArray(children) ? children : children ? [children] : [];
  const slots = { header: null, footer: null, rest: [] };
  for (const child of list) {
    if (child && child.type === Header) slots.header = child;
    else if (child && child.type === Footer) slots.footer = child;
    else slots.rest.push(child);
  }
  return slots;
}

const flat = collectSlots([h(Header, null, h(Title, null)), h(Body, null), h(Footer, null, h(Actions, null))]);
const wrapped = collectSlots([
  h("div", { className: "sticky" }, h(Header, null, h(Title, null))),   // 🐛 one wrapper
  h(Body, null),
  h(Footer, null, h(Actions, null)),
]);

console.log("    flat children     → header found:", flat.header !== null,
  " footer found:", flat.footer !== null, "✅");
console.log("    header in a <div> → header found:", wrapped.header !== null,
  " footer found:", wrapped.footer !== null, "🐛");
console.log("    ...and the header silently fell into `rest`:", wrapped.rest.length, "items instead of 1");

console.log("\n  Same failure as React.Children.map + cloneElement in 01 §4, same");
console.log("  cause: `children` is a flat list of element DESCRIPTIONS, and you are");
console.log("  pattern-matching on a shape the caller is free to change. It also");
console.log("  breaks on: a fragment, a conditional (`{x && <Card.Header/>}` puts");
console.log("  `false` in the list), a .map(), and a re-exported wrapper component.");
console.log("\n  So: use element props when you need reliability, and type detection");
console.log("  only when the nicer call site is worth documenting the constraint.");
console.log("  Most component libraries that use it also ship a runtime warning.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — EMPTY SLOTS: DEFAULTS, AND COLLAPSING THE LAYOUT
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what happens when a slot is not filled:\n");

// Three behaviours, and choosing wrongly is a visible bug:
//   1. render a DEFAULT              (a Dialog with no footer gets a Close button)
//   2. render NOTHING and COLLAPSE   (no empty 48px header row)
//   3. render nothing and leave the box (almost always wrong)

function CollapsingCard(props) {
  return h("article", null, [
    props.header ? h("header", null, props.header) : null,     // ✅ collapses
    h("div", { className: "body" }, props.children),
    props.footer ? h("footer", null, props.footer) : h("footer", null, h("button", null, "Close")), // ✅ default
  ]);
}
function LeakyCard(props) {
  return h("article", null, [
    h("header", null, props.header),                            // 🐛 always renders
    h("div", { className: "body" }, props.children),
    h("footer", null, props.footer),
  ]);
}

const r2 = createRenderer();
const collapsed = r2.render(h(CollapsingCard, null, h(Body, null)));
const leaky = r2.render(h(LeakyCard, null, h(Body, null)));

const regionsOf = out => out.filter(s => ["<header>", "<div>", "<footer>"].includes(s)).length;

console.log("    no header, no footer supplied:");
console.log("      collapsing card → regions rendered:", regionsOf(collapsed), JSON.stringify(collapsed));
console.log("      leaky card      → regions rendered:", regionsOf(leaky), "🐛 an empty <header> box");
console.log("\n    the collapsing card still filled the footer with a default:",
  collapsed.includes("Close"), "✅");

console.log("\n  Why the leaky version is a real bug and not a nitpick: an empty");
console.log("  <header> still has padding, a border-bottom and a min-height. The");
console.log("  caller sees a 1px line and 24px of whitespace above their content and");
console.log("  has no way to remove it. Every slot needs an explicit answer to");
console.log("  'what if this is empty?'.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE FREE PERFORMANCE WIN
// ══════════════════════════════════════════════════════════════════

console.log("§6 — who CREATED the element decides whether it re-renders:\n");

// An element passed as a prop was created by the CALLER's render. When the
// slot-owning component re-renders for its own reasons, that prop still holds
// the SAME element object, so React bails out on the whole subtree — no memo,
// no useCallback, no dependency array.
//
//   ✅ function Page() {                       ❌ function Layout({ tab }) {
//        const chart = <ExpensiveChart />;          return <><Tabs/>
//        return <Layout content={chart} />;                   <ExpensiveChart /></>;
//      }                                          }
//
// In the ❌ version the element is created INSIDE Layout, so every Layout
// render creates a new one and ExpensiveChart re-renders every time.
// → 05_optimization-techniques/03_avoiding-unnecessary-re-renders.js §6

function ExpensiveChart() { return h("canvas", null, "chart"); }

// ❌ the owner creates it
function LayoutInline(props) {
  return h("div", null, [h("span", null, `tab ${props.tab}`), h(ExpensiveChart, null)]);
}
// ✅ the caller creates it, once, and passes it in
function LayoutSlot(props) {
  return h("div", null, [h("span", null, `tab ${props.tab}`), props.content]);
}

const rInline = createRenderer();
for (let tab = 0; tab < 5; tab++) rInline.render(h(LayoutInline, { tab }));

const rSlot = createRenderer();
const chartElement = h(ExpensiveChart, null);          // created ONCE, by the caller
for (let tab = 0; tab < 5; tab++) rSlot.render(h(LayoutSlot, { tab, content: chartElement }));

console.log("    5 re-renders of the layout (the tab changed):");
console.log("      chart created INSIDE the layout →", rInline.count("ExpensiveChart"), "renders 🐛");
console.log("      chart passed IN as a slot       →", rSlot.count("ExpensiveChart"), "render,",
  rSlot.skips(), "skips ✅");

console.log("\n  No memo anywhere in either run. React skips the subtree because the");
console.log("  element object is identical — it can prove nothing below it changed.");
console.log("\n  This is why `children` is the classic answer to 'my provider");
console.log("  re-renders the whole app': a provider that receives children does not");
console.log("  re-create them. → 05_provider-pattern.js §13 Q11");
console.log("\n  And the caveat, so you are not caught out: this only holds while the");
console.log("  CALLER does not re-render. If the caller re-renders, it creates a new");
console.log("  element and the slot content renders again — correctly. Slots move");
console.log("  the trigger, they do not remove it.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — asChild: THE SLOT THAT DISAPPEARS
// ══════════════════════════════════════════════════════════════════

console.log("§7 — merging behaviour onto the caller's element:\n");

// The problem: your <Button> renders a <button>. The caller needs a link that
// looks and behaves exactly like a Button. Options:
//   ❌ <Button as="a">                       — a prop that swallows types
//   ❌ <Button><Link/></Button>              — a <button> wrapping an <a>: invalid HTML
//   ✅ <Button asChild><Link to="/x">Go</Link></Button>
//
// asChild means: do not render your own element. Take the single child the
// caller gave you, merge your props onto it, and render THAT. Radix ships this
// as <Slot>. It needs ref forwarding to work at all. → 09_forwarding-refs.js

function mergeProps(mine, theirs) {
  const merged = { ...mine, ...theirs };
  // className concatenates; event handlers COMPOSE (both run, caller first)
  if (mine.className && theirs.className) merged.className = `${mine.className} ${theirs.className}`;
  for (const key of Object.keys(mine)) {
    if (key.startsWith("on") && typeof mine[key] === "function" && typeof theirs[key] === "function") {
      merged[key] = (...args) => { theirs[key](...args); mine[key](...args); };
    }
  }
  return merged;
}

function Slot(props) {
  const { children, ...mine } = props;
  const child = Array.isArray(children) ? children[0] : children;
  return { type: child.type, props: mergeProps(mine, child.props) };   // ← no wrapper
}

const buttonBehaviour = { className: "btn btn-primary", onClick: () => calls.push("button-behaviour") };
const calls = [];

function ButtonNormal(props) { return h("button", { ...buttonBehaviour }, props.children); }
function ButtonAsChild(props) { return h(Slot, { ...buttonBehaviour }, props.children); }

const r3 = createRenderer();
const normalOut = r3.render(h(ButtonNormal, null, h("a", { href: "/x", className: "link" }, "Go")));
const asChildEl = Slot({ ...buttonBehaviour, children: h("a", { href: "/x", className: "link", onClick: () => calls.push("caller-handler") }, "Go") });

console.log("    <Button><a/></Button>         →", JSON.stringify(normalOut), "🐛 <button> wrapping <a>");
console.log("    <Button asChild><a/></Button> → element type:", asChildEl.type);
console.log("      merged className :", JSON.stringify(asChildEl.props.className));
console.log("      href preserved   :", JSON.stringify(asChildEl.props.href));
asChildEl.props.onClick();
console.log("      onClick composed :", JSON.stringify(calls), "← both ran, caller first");
console.log("      wrapper elements :", 0, "✅  (the <button> is gone entirely)");

console.log("\n  Three rules asChild has to get right, and they are the interview:");
console.log("    1. className/style CONCATENATE — last-wins would delete the caller's");
console.log("    2. handlers COMPOSE, and the caller's runs first so it can call");
console.log("       e.preventDefault() before yours");
console.log("    3. the ref must be MERGED, not replaced — your component and the");
console.log("       caller may both need it (→ 09). This is the part people miss.");
console.log("\n  And the constraint: exactly one child, and it must accept a ref and");
console.log("  spread its props. Two children, or a child that ignores props, and the");
console.log("  pattern silently does nothing.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — SLOTS vs COMPOUND COMPONENTS vs RENDER PROPS
// ══════════════════════════════════════════════════════════════════
//
//                        Slots              Compound (01)        Render props (02)
//   ──────────────────────────────────────────────────────────────────────────────
//   caller supplies      elements           components           a function
//   who owns ORDER       the component ✅   the caller           the caller
//   who owns STATE       the component      the component        the component
//   caller sees state    no                 via context          via arguments
//   guarantees layout    YES                no                   no
//   needs context        no                 yes                  no
//   typing               easy               medium               easiest
//   free render bailout  YES (§6)           no                   no (§7 of 02)
//
// The one-line decision rule:
//   Does the caller need to KNOW something the component knows?
//     yes → render props / compound (they need the value or the context)
//     no  → slots. Just give them the hole.
//
// Real libraries mix all three, and that is the honest answer: Radix's Dialog
// is compound (Dialog.Trigger, Dialog.Content), each part takes slots
// (children), and Dialog.Trigger takes asChild. One component, three patterns,
// each doing the job it is best at.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHERE SLOTS GO WRONG
// ══════════════════════════════════════════════════════════════════
//
//   • TOO MANY SLOTS. header, subheader, actions, footer, aside, overlay,
//     emptyState, loadingState — and you have rebuilt the prop explosion from
//     01 §3 with elements instead of strings. Past about four, the component
//     wants to be compound.
//
//   • THE COMPONENT ASSUMES THE CONTENT'S SHAPE. Styling `header > h2` in your
//     CSS, or measuring the header's height and assuming one line. The caller
//     put a <Tooltip> around it and your selector stopped matching. Style the
//     SLOT container, never the slot's contents.
//
//   • ACCESSIBILITY. If your Card renders <header> and the caller puts an <h1>
//     in the footer slot, the document outline is now wrong and you cannot
//     see it from inside the component. Slots move a11y responsibility to the
//     caller — document it.
//
//   • TYPES. `ReactNode` accepts strings, numbers, arrays, null and booleans;
//     `ReactElement` accepts exactly one element. If you are going to
//     cloneElement it or read its props, you need ReactElement, and the error
//     message when you get it wrong is not helpful.
//
//   • KEYS. Slot content rendered from an array still needs keys, and the
//     warning points at YOUR component, not the caller's.
//     → 01_react-fundamentals/05_keys-in-lists.js


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A slot's content lands in the wrong region:
//   Child-type detection and somebody wrapped the child. → §4.
//
// Bug 2 — An empty 48px bar above every card without a header:
//   The slot region always renders. → §5.
//
// Bug 3 — The expensive chart re-renders on every tab click:
//   It was created inside the layout instead of passed in. → §6.
//
// Bug 4 — A <button> wrapping an <a>, and the link is not keyboard-reachable:
//   No asChild. Invalid HTML, and real a11y damage. → §7.
//
// Bug 5 — asChild loses the caller's className or onClick:
//   Props merged with a plain spread instead of composing. → §7.
//
// Bug 6 — asChild breaks the caller's ref:
//   The refs were replaced instead of merged. → §7, and 09.
//
// Bug 7 — "Each child in a list should have a unique key" pointing at YOUR
//   component: slot content built from an array without keys. → §9.
//
// Bug 8 — The design-system CSS stops applying after a refactor:
//   Styles written as `.card header > h2` and the caller wrapped their title.
//   → §9.
//
// Bug 9 — A conditional slot renders `false` as a region:
//   `{isAdmin && <Actions/>}` passed to a slot that does not check. Truthiness
//   on the slot, not just on the caller's side.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Elements as props:
assert(filled.includes("Invoice #204") && filled.includes("Download"),
  "both named slots rendered their content ✅");
assert(shapeOf(filled) === shapeOf(swapped),
  "different content, identical structure — that is the guarantee slots sell ✅");
assert(shapeOf(filled) === "<article><header><h2></h2></header><div><p></p></div><footer><button></button></footer></article>",
  "and the component decided that structure, not the caller");

// Child-type detection:
assert(flat.header !== null && flat.footer !== null,
  "type detection finds direct children ✅");
assert(wrapped.header === null && wrapped.footer !== null,
  "one wrapping <div> and the header is lost 🐛 — same bug as 01 §4");
assert(wrapped.rest.length === 2,
  "...it silently ended up in the default slot instead");

// Empty slots:
assert(regionsOf(collapsed) === 2, "an unfilled header collapses — 2 regions, not 3 ✅");
assert(regionsOf(leaky) === 3, "the leaky card renders an empty <header> box 🐛");
assert(collapsed.includes("Close"), "an unfilled footer fell back to its default ✅");

// The performance property:
assert(rInline.count("ExpensiveChart") === 5,
  "created inside the layout → re-rendered on all 5 layout renders 🐛");
assert(rSlot.count("ExpensiveChart") === 1 && rSlot.skips() === 4,
  "passed in as a slot → 1 render, 4 element-identity bailouts, no memo ✅");

// asChild:
assert(normalOut[0] === "<button>" && normalOut[1] === "<a>",
  "without asChild you get a <button> wrapping an <a> 🐛");
assert(asChildEl.type === "a", "with asChild the wrapper disappears entirely ✅");
assert(asChildEl.props.className === "btn btn-primary link",
  "className CONCATENATES — the caller's class survives ✅");
assert(asChildEl.props.href === "/x", "the caller's own props are preserved");
assert(JSON.stringify(calls) === '["caller-handler","button-behaviour"]',
  "handlers COMPOSE, caller first, so preventDefault still works ✅");

console.log("§11 — mini assertions passed for: Slot Pattern");
console.log("\n  The pair that captures it: a chart created inside the layout rendered");
console.log("  5 times and the same chart passed in as a slot rendered 1 — with no");
console.log("  memo — while asChild removed a wrapper element and still merged two");
console.log("  classNames and composed two click handlers.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the slot pattern?", answer:
//
//   "Named holes. children is a hole the caller fills; a slot is the same idea
//    with a name, so a component can have several — header, footer, actions —
//    while keeping control of where each one sits. React has no slot API, so
//    in practice it's just elements passed as props: <Card header={<Title/>}
//    footer={<Actions/>}>body</Card>.
//
//    The reason to choose it over a compound component is who owns ORDER.
//    Compound components hand the caller the whole layout, so they could put
//    the footer above the header. Slots keep the arrangement inside the
//    component, which is exactly what a design system is selling — every Card
//    in the product lines up, and the caller still controls the content.
//
//    There's a second implementation people reach for — walking children and
//    matching child.type against Card.Header — and I'd avoid it, for the same
//    reason cloneElement fails in compound components: it works with flat
//    children and breaks the moment somebody wraps one in a div, or uses a
//    conditional that puts `false` in the array. The header just silently
//    lands in the default slot.
//
//    Two things I'd bring up that aren't in most answers. First, empty slots
//    need an explicit decision — default content, or collapse the region
//    entirely. A region that always renders leaves an empty bar with padding
//    and a border that the caller cannot remove.
//
//    Second, there's a free performance property. An element passed as a prop
//    was created by the CALLER's render, so when the layout component
//    re-renders for its own reasons, that prop still holds the same element
//    object and React bails out on the whole subtree — no memo needed. It's
//    the same reason passing children into a provider stops it re-rendering
//    the app.
//
//    And the advanced version is asChild — Radix's Slot. Instead of rendering
//    your own element, you take the caller's single child and merge your props
//    onto it, so <Button asChild><Link/></Button> renders one <a> with the
//    button's styling and behaviour instead of a button wrapping a link.
//    Getting it right means concatenating className, composing handlers with
//    the caller's running first so preventDefault works, and merging refs
//    rather than replacing them."
//
// The order-ownership distinction and the element-identity bailout are the two
// things that make this more than "you can pass JSX as a prop".


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Slots or compound components?
// A1. Ask who should own the ORDER. Component → slots. Caller → compound.
//
// Q2. Why not detect children by type?
// A2. It breaks on wrappers, fragments, conditionals and maps. Element props
//     cannot break that way.
//
// Q3. What is `children`, really?
// A3. An ordinary prop that JSX fills in from between the tags. The default,
//     unnamed slot.
//
// Q4. Why does passing an element as a prop avoid re-renders?
// A4. The element object is created by the caller, so it is identical across
//     the receiver's re-renders and React bails out on that subtree.
//
// Q5. Does that mean it never re-renders?
// A5. No. When the CALLER re-renders it creates a new element and the content
//     renders again — correctly. Slots move the trigger, not remove it.
//
// Q6. What is asChild for?
// A6. Rendering your behaviour on someone else's element, so you do not nest
//     an <a> inside a <button> or invent an `as` prop.
//
// Q7. What has to be merged for asChild to work?
// A7. className/style concatenated, event handlers composed (caller first),
//     and refs merged — which needs ref forwarding.
//
// Q8. ReactNode or ReactElement for a slot prop?
// A8. ReactNode for "render it wherever"; ReactElement if you will clone it
//     or read its props.
//
// Q9. When does a slot API become a smell?
// A9. Past about four slots. At that point the component wants to be compound.
//
// Q10. Who owns accessibility for slot content?
// A10. The caller, and that must be documented — you cannot see what they put
//      in the hole, and your heading levels and landmarks depend on it.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Slot pattern, in one line?
//   Back : Named children. The component owns the layout, the caller fills
//          labelled holes.
//
// Flashcard 2:
//   Front: Slots vs compound components?
//   Back : Who owns the ORDER. Slots keep it; compound gives it away.
//
// Flashcard 3:
//   Front: Why avoid child.type detection?
//   Back : One wrapper element and the slot is silently lost.
//
// Flashcard 4:
//   Front: What must every slot decide?
//   Back : What happens when it is empty — default, or collapse.
//
// Flashcard 5:
//   Front: Why is an element prop cheap?
//   Back : Created by the caller → same object across the receiver's renders
//          → React bails out.
//
// Flashcard 6:
//   Front: What is asChild?
//   Back : Render the caller's element with your props merged onto it, instead
//          of your own wrapper.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Radix's Dialog is compound, each part takes slots, and the trigger
//          takes asChild. Real components mix all three."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build <Card header footer> with element props. Then try to make the footer
//   render above the header from the call site. You cannot — that is the point.
//
// Task 2:
//   Reimplement it with child-type detection, then wrap one slot child in a
//   <div> and watch it disappear into the body.
//
// Task 3:
//   Make an unfilled header render an empty bar. Look at it. Then collapse it.
//
// Task 4:
//   Put an expensive component inside a layout and log its renders while the
//   layout's state changes. Then pass it in as a prop. 5 → 1.
//
// Task 5:
//   Implement <Slot> yourself: one child, merge className, compose onClick,
//   forward the ref. Test it with <Button asChild><a/></Button>.
//
// Task 6:
//   Add a fifth and sixth slot to your Card. Notice where it starts feeling
//   wrong, and convert it to a compound component.
//
// Task 7:
//   Type the slot props twice — once as ReactNode, once as ReactElement — and
//   find the call site that only compiles under one of them.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Slots are named children. The component keeps the layout; the caller fills
//   the holes.
//
// If you remember the common bug:
//   Sorting children by child.type. One wrapper element and the slot silently
//   goes to the wrong place.
//
// If you remember the professional framing:
//   Slots trade flexibility for consistency, and they come with a free render
//   bailout because the caller created the element. When you need more than
//   four of them, or the caller needs to know something the component knows,
//   you have outgrown slots — go compound.
//
// NEXT TOPIC -> 11_headless-components.js
