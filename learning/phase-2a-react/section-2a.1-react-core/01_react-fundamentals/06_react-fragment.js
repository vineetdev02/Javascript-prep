// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  06_react-fragment.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React.Fragment
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. Why Fragments exist — a JAVASCRIPT limit, not a React one
//   3. A working Fragment implementation you build yourself
//   4. <> </> vs <React.Fragment key> — and when the short form fails
//   5. The div-soup problem: flexbox/grid breakage, proven
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/06_react-fragment.js"
//
// Prerequisite: 01_jsx-compilation.js — §7 there showed WHY two root nodes
// fail to compile. This file is the fix.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React.Fragment:
// A component that groups children into ONE return value without producing
// any DOM node.
//
// If interviewer says "explain it simply", say:
// "It is an invisible wrapper. It satisfies JavaScript's 'a function returns
//  one value' rule without adding a <div> to the DOM."
//
// If interviewer asks "why does it matter?", say:
// "Because a wrapper div is not free. It breaks flexbox and grid parent-child
//  relationships, it makes <table> and <ul> invalid HTML, and it bloats the
//  tree. Fragments let component boundaries be a code concern, not a DOM one."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   one return value, zero DOM nodes
//
// The chain of reasoning (say it in this order and you sound senior):
//
//   1. A function can return only ONE value.        ← JavaScript
//   2. JSX compiles to function calls.              ← the compiler
//   3. So a component can return only one element.  ← consequence
//   4. Wrapping in <div> satisfies (3) but pollutes the DOM.
//   5. Fragment satisfies (3) with a node React drops at commit time.
//
// Runtime rule:
//   A Fragment IS a real element with type = Symbol.for("react.fragment").
//   Reconciliation treats it as a node — it just never creates a host
//   instance. Its children are hoisted into the parent's DOM slot.
//
// Practical rule:
//   Default to a Fragment. Add a div only when you need it for styling,
//   a ref, or an event handler.
//
// Common trap:
//   Thinking a Fragment disappears entirely. It does not — it exists in the
//   fiber tree and takes part in reconciliation. That is exactly why it can
//   take a key, and why removing a Fragment changes the tree shape and can
//   reset state. → 03_reconciliation-algorithm.js


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD A FRAGMENT
// ══════════════════════════════════════════════════════════════════

const FRAGMENT = Symbol.for("react.fragment");

function h(type, props, ...children) {
  const { key = null, ...rest } = props || {};
  return { type, key, props: rest, children: children.flat() };
}

// <>...</> is just this:
function Fragment(props) {
  return props.children;
}

// Now the renderer. The ONLY special thing about a Fragment: when we hit
// one, we do not create a DOM node — we splice its children into the parent.

function renderToDOM(vnode, depth = 0, output = []) {
  if (typeof vnode === "string") {
    output.push({ depth, tag: "#text", text: vnode });
    return output;
  }

  if (vnode.type === FRAGMENT) {
    // ← THE WHOLE IMPLEMENTATION. No node created. Children go to the
    //   parent's level — note we pass `depth` unchanged, not depth + 1.
    for (const child of vnode.children) {
      renderToDOM(child, depth, output);
    }
    return output;
  }

  output.push({ depth, tag: vnode.type });
  for (const child of vnode.children) {
    renderToDOM(child, depth + 1, output);
  }
  return output;
}

function show(output) {
  return output
    .map(n => "  " + "│ ".repeat(n.depth) + (n.text ? `"${n.text}"` : `<${n.tag}>`))
    .join("\n");
}


// ══════════════════════════════════════════════════════════════════
// § 4 — FRAGMENT vs DIV: THE DOM DIFFERENCE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — same component, two wrappers:\n");

// return <div><h1/><p/></div>
const withDiv = h("section", null,
  h("div", null,
    h("h1", null, "Title"),
    h("p", null, "Body")
  )
);

// return <><h1/><p/></>
const withFragment = h("section", null,
  h(FRAGMENT, null,
    h("h1", null, "Title"),
    h("p", null, "Body")
  )
);

console.log("  <div> wrapper:");
console.log(show(renderToDOM(withDiv)));
console.log("\n  <> </> fragment:");
console.log(show(renderToDOM(withFragment)));

const divNodes = renderToDOM(withDiv).filter(n => n.tag !== "#text").length;
const fragNodes = renderToDOM(withFragment).filter(n => n.tag !== "#text").length;
console.log(`\n  DOM elements: div wrapper = ${divNodes}, fragment = ${fragNodes}`);
console.log("  The h1 and p are now DIRECT children of <section>.");
console.log("  That is not cosmetic — it decides whether CSS works. → §5\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY THE WRAPPER DIV IS A REAL BUG, NOT A STYLE NITPICK
// ══════════════════════════════════════════════════════════════════
//
// This is the part juniors under-sell. "Fragments avoid extra divs" is true
// and boring. Here is why it MATTERS:
//
// 1. FLEXBOX / GRID ONLY SEE DIRECT CHILDREN
//
//      .row { display: flex; gap: 8px; }
//
//      <div className="row">
//        <Fields />      ← returns <div><input/><input/></div>
//      </div>
//
//    The flex container has ONE child (the wrapper div). Your two inputs are
//    not flex items at all. gap does nothing. The layout silently collapses,
//    and the CSS looks correct. Fragment fixes it because the inputs become
//    direct children.
//
// 2. SOME PARENTS REJECT A DIV OUTRIGHT — invalid HTML
//
//      <table><tbody>
//        <Columns />     ← returns <div><td/><td/></div>
//      </tbody></table>
//
//    <div> is not allowed inside <tbody>. The browser HOISTS it out of the
//    table. Your layout explodes and the DOM does not match your JSX.
//    Same for <ul>/<li>, <select>/<option>, <dl>/<dt>.
//    This is the ORIGINAL motivation for Fragments (React 16.2).
//
// 3. CSS SELECTORS BREAK
//      ul > li  stops matching when a div sneaks in between.
//
// 4. ACCESSIBILITY
//      An unnecessary div can break the required parent-child roles that
//      screen readers rely on (list > listitem, table > row > cell).

console.log("§5 — flexbox: who are the flex items?\n");

function flexItemsOf(tree) {
  // The flex container is the first element; its DIRECT children are the items.
  const rendered = renderToDOM(tree);
  const containerDepth = rendered[0].depth;
  return rendered
    .filter(n => n.depth === containerDepth + 1 && n.tag !== "#text")
    .map(n => n.tag);
}

const rowWithDiv = h("div", null,        // .row { display:flex }
  h("div", null, h("input", null), h("input", null))
);
const rowWithFragment = h("div", null,
  h(FRAGMENT, null, h("input", null), h("input", null))
);

console.log("  <div className='row'> + wrapper div → flex items:",
  JSON.stringify(flexItemsOf(rowWithDiv)));
console.log("  <div className='row'> + fragment     → flex items:",
  JSON.stringify(flexItemsOf(rowWithFragment)));
console.log("\n  ↑ With the wrapper, ONE flex item. `gap` and `justify-content`");
console.log("    apply to a single box, so the CSS appears to do nothing.");
console.log("    With the fragment, TWO flex items and the CSS works.");
console.log("    Same JSX shape. Totally different rendering.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — <> </> vs <React.Fragment> — WHEN THE SHORT FORM FAILS
// ══════════════════════════════════════════════════════════════════
//
// The short syntax cannot take ANY attributes. Not key, not anything.
//
//   <>            </>              ← no props possible. Ever.
//   <React.Fragment key={id}>      ← the ONLY way to key a fragment
//
// You need the long form exactly when rendering a LIST of fragments:
//
//   {items.map(item => (
//     <React.Fragment key={item.id}>
//       <dt>{item.term}</dt>
//       <dd>{item.definition}</dd>
//     </React.Fragment>
//   ))}
//
// This example is not academic — it is the canonical case. A <dl> requires
// <dt> and <dd> as direct children, so you cannot wrap the pair in a div,
// and you cannot use <> because you need a key. Same for table rows that
// render two <td> per item.
//
// key is the only prop a Fragment accepts. There is no className, no ref,
// no onClick — a Fragment has no DOM node to attach them to.

console.log("§6 — a keyed list of fragments (the <dl> case):\n");

const glossary = [
  { id: "g1", term: "Fiber", def: "A unit of work" },
  { id: "g2", term: "Key", def: "A stable identity" },
];

const dl = h("dl", null,
  ...glossary.map(item =>
    h(FRAGMENT, { key: item.id },
      h("dt", null, item.term),
      h("dd", null, item.def)
    )
  )
);

console.log(show(renderToDOM(dl)));
console.log("\n  <dt> and <dd> are DIRECT children of <dl> — valid HTML —");
console.log("  and each pair still has a stable key for reconciliation.");
console.log("  A wrapper div here would be invalid. <> </> could not be keyed.");
console.log("  This is the case <React.Fragment> exists for.\n");

const fragmentKeys = dl.children.map(c => c.key);
console.log("  fragment keys:", JSON.stringify(fragmentKeys));
console.log("  fragments in the DOM output:",
  renderToDOM(dl).filter(n => n.tag === "fragment").length, "← zero, as designed\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE FRAGMENT IS STILL A NODE IN THE TREE
// ══════════════════════════════════════════════════════════════════
//
// The trap from §2, made concrete. A Fragment produces no DOM, but it DOES
// exist in the fiber tree — so adding or removing one changes the tree shape
// and reconciliation notices.
//
//   {cond ? <><A/></> : <A/>}
//
// Those are different types at that slot (fragment vs A), so React unmounts
// and remounts A. State lost. A Fragment is invisible in the DOM, NOT in the
// reconciler.

console.log("§7 — a fragment is invisible in the DOM, not in the tree:\n");

const wrapped = h("div", null, h(FRAGMENT, null, h("input", null)));
const bare = h("div", null, h("input", null));

console.log("  <div><><input/></></div> DOM:", JSON.stringify(
  renderToDOM(wrapped).map(n => n.tag)));
console.log("  <div><input/></div>      DOM:", JSON.stringify(
  renderToDOM(bare).map(n => n.tag)));
console.log("  identical DOM?",
  JSON.stringify(renderToDOM(wrapped)) === JSON.stringify(renderToDOM(bare)));
console.log("\n  BUT in the element tree:");
console.log("   wrapped: div > fragment > input   (child type:",
  String(wrapped.children[0].type) + ")");
console.log("   bare   : div > input              (child type:",
  bare.children[0].type + ")");
console.log("  → different types at that slot. Toggling between these two");
console.log("    forms remounts the input and wipes what the user typed.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   splice children inline     a fiber with tag=Fragment and NO stateNode;
//                              the commit phase walks up to find the nearest
//                              host parent for the children
//   type === FRAGMENT check    the same Symbol.for("react.fragment"), so
//                              fragments survive being sent across bundles
//   no dev warnings            warns on invalid Fragment props:
//                              "Invalid prop `className` supplied to
//                               `React.Fragment`"
//   n/a                        <Fragment> is also what an array return
//                              compiles to conceptually — return [<A/>,<B/>]
//                              is legal too, but then you must key manually
//
// Historical note interviewers like:
//   Fragments landed in React 16.2 (2017). Before that the workaround was
//   returning an ARRAY with manual keys — return [<td key="1"/>, <td key="2"/>]
//   — which is why the <table> case is always the example. React 16.0 made
//   array returns possible at all; 16.2 made them ergonomic.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "My flexbox gap does nothing":
//   A child component returns a wrapper div, so the flex container has one
//   item. → §5. Extremely common and hard to spot in DevTools.
//
// Bug 2 — Table layout explodes:
//   A component returns <div><td/></div>. The browser hoists the div out of
//   the table because it is invalid HTML. Your DOM stops matching your JSX.
//
// Bug 3 — "Each child in a list should have a unique key" on a fragment:
//   You used <> </> inside a map. It cannot take a key.
//   Fix: <React.Fragment key={id}>.
//
// Bug 4 — Passing className to a Fragment:
//   <React.Fragment className="row"> → warning, and it does nothing. There
//   is no DOM node to put it on. If you need a class, you need a real element.
//
// Bug 5 — Trying to ref a Fragment:
//   No host instance = nothing to reference. Put the ref on a real child.
//
// Bug 6 — State resets when toggling a conditional fragment. → §7.
//
// Bug 7 — Over-correcting: removing a div that CSS depends on. Fragments are
//   the default, not a rule. If the div is a flex container or a positioning
//   context, it earns its place.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

assert(fragNodes === divNodes - 1, "a fragment produces exactly one fewer DOM node");
assert(renderToDOM(withFragment).every(n => n.tag !== "fragment"),
  "the fragment itself never reaches the DOM");

// The flexbox proof:
assert(flexItemsOf(rowWithDiv).length === 1,
  "wrapper div: the flex container has only ONE item — CSS silently breaks");
assert(flexItemsOf(rowWithFragment).length === 2,
  "fragment: both inputs are real flex items");

// The keyed-fragment proof:
assert(dl.children.every(c => c.key !== null), "fragments in a list carry keys");
assert(renderToDOM(dl).filter(n => n.tag === "dt").length === 2,
  "dt elements are direct children of dl");
assert(renderToDOM(dl).filter(n => n.tag !== "#text").every(n => n.depth <= 1),
  "no wrapper depth was introduced — dl > dt/dd directly, valid HTML");

// The §7 trap, asserted:
assert(JSON.stringify(renderToDOM(wrapped)) === JSON.stringify(renderToDOM(bare)),
  "fragment vs no fragment: identical DOM");
assert(wrapped.children[0].type !== bare.children[0].type,
  "...but DIFFERENT element types — so toggling between them remounts");

console.log("§10 — mini assertions passed for: React.Fragment");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a Fragment and why use it?", answer like this:
//
//   "A Fragment groups children into one return value without creating a DOM
//    node. The reason it exists is JavaScript, not React: a function returns
//    one value, JSX compiles to function calls, so a component returns one
//    element. A wrapper div satisfies that, but it pollutes the DOM.
//
//    And that pollution is a real bug, not a nitpick. Flexbox and grid only
//    apply to DIRECT children, so a component that returns a wrapper div
//    silently drops out of its parent's layout — gap does nothing and the CSS
//    looks fine. Worse, inside a <table> or <ul> a div is invalid HTML, so the
//    browser hoists it and the DOM stops matching your JSX. That table case is
//    literally why Fragments were added in 16.2.
//
//    The short syntax <> </> takes no props. The moment I render a list of
//    fragments — the classic <dl> with dt/dd pairs — I need
//    <React.Fragment key={id}>, because key is the only prop a Fragment accepts.
//
//    One nuance: a Fragment is invisible in the DOM but NOT in the fiber tree.
//    It participates in reconciliation, so conditionally adding one changes
//    the type at that slot and remounts the subtree."
//
// The flexbox point is what makes this answer stand out. Almost nobody says it.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why can a component not return two elements?
// A1. A JavaScript function returns one value, and JSX compiles to function
//     calls. It is a language constraint surfacing through the sugar.
//
// Q2. Why not just use a div?
// A2. It breaks flex/grid parent-child relationships, is invalid inside
//     table/list parents, breaks direct-child CSS selectors, and can break
//     ARIA roles. It is not free.
//
// Q3. When must you use <React.Fragment> over <> </>?
// A3. When you need a key — a list of fragments. The short form takes no props.
//
// Q4. Can a Fragment take className or a ref?
// A4. No. There is no host instance to attach them to. key is the only prop.
//
// Q5. Does a Fragment appear in the fiber tree?
// A5. Yes — a fiber with no stateNode. It affects reconciliation identity even
//     though it produces no DOM.
//
// Q6. What did people do before Fragments?
// A6. Returned an array with manual keys (React 16.0+). 16.2 added Fragments
//     as the ergonomic version.
//
// Q7. Is <></> ever a performance win?
// A7. Marginally — one less fiber and one less DOM node per instance. In a
//     10k-row table that adds up, but correctness (layout, valid HTML) is the
//     real reason to use it.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a Fragment?
//   Back : One return value, zero DOM nodes.
//
// Flashcard 2:
//   Front: Why do Fragments exist?
//   Back : A JS function returns one value. JSX compiles to function calls.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Thinking the div is harmless. Flex/grid only see direct children.
//
// Flashcard 4:
//   Front: <> </> vs <React.Fragment>?
//   Back : Short form takes no props. Need a key → long form.
//
// Flashcard 5:
//   Front: What props can a Fragment take?
//   Back : Only key. No className, no ref — there is no DOM node.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Name the flexbox breakage and the invalid-HTML-in-table case.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add nested fragments — a fragment inside a fragment. Confirm renderToDOM
//   flattens both. Where in the code does that flattening happen?
//
// Task 2:
//   Make renderToDOM warn when a Fragment gets any prop other than key.
//   That is React's real dev warning, in two lines.
//
// Task 3:
//   Build the <table> case: a component returning two <td>. Render it once
//   with a div wrapper and once with a fragment, and write out what a browser
//   would do with the invalid div.
//
// Task 4:
//   Break §7 on purpose: reconcile `wrapped` against `bare` using the
//   reconciler from 03_reconciliation-algorithm.js. Predict REPLACE first.
//
// Task 5:
//   Measure it: build a 1000-row list with and without a wrapper div and
//   count the DOM nodes. Is the saving worth arguing about? Form an opinion
//   you can defend.
//
// Task 6:
//   Explain in 60 seconds why a wrapper div broke someone's `gap: 8px`,
//   without saying "extra div is bad."


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Fragment = one return value, zero DOM nodes.
//
// If you remember the common bug:
//   A wrapper div makes your component ONE flex item instead of many. The
//   CSS looks right and the layout is wrong.
//
// If you remember the professional framing:
//   Fragments exist because of a JavaScript rule. They matter because of
//   CSS and valid HTML. And they still occupy a slot in the fiber tree.
//
// NEXT TOPIC -> 07_conditional-rendering-patterns.js
