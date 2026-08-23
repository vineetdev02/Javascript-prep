// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  02_render-props-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Render Props Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. The problem it was invented for: sharing STATEFUL LOGIC, pre-hooks
//   2. render={fn} and children={fn} are the same pattern — proven
//   3. The pyramid of doom, measured in indentation levels
//   4. Why an inline render prop destroys React.memo — proven with counts
//   5. What hooks replaced, and the four places render props still win
//   6. The libraries still shipping it today, and why they must
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/02_render-props-pattern.js"
//
// Prerequisites: 03_custom-hooks/01_rules-of-hooks.js and
// 05_optimization-techniques/02_referential-equality-problem.js.
//
// 01 handed the caller the LAYOUT. This file hands the caller the RENDER —
// the component computes a value and lets the caller decide what it looks
// like. 03 will do the same job by wrapping instead of calling back.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Render Props:
// A component that takes a FUNCTION as a prop and calls it with its internal
// state, so the caller decides what to render with that state.
//
//   <MousePosition render={({ x, y }) => <p>{x}, {y}</p>} />
//
//   function MousePosition({ render }) {
//     const [pos, setPos] = useState({ x: 0, y: 0 });
//     useEffect(() => { … }, []);
//     return render(pos);         // ← the whole pattern is this one line
//   }
//
// If interviewer says "explain it simply", say:
// "Normally a component decides what to render. With a render prop, it decides
//  WHAT TO COMPUTE and asks you what to render with it. The prop isn't an
//  element, it's a function — the component calls it and returns whatever
//  comes back."
//
// If interviewer asks "why does it matter?", say:
// "Before hooks it was the only clean way to share stateful logic between
//  components. A custom hook does that job better now, so most render props
//  have been replaced — but not all of them, and knowing which ones survived
//  is the interesting part of the answer."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   INVERSION OF RENDERING — you own the data, the caller owns the markup.
//
// Runtime rule:
//   The prop is a function, and the owner CALLS it during its own render. So
//   whatever the function returns is part of the owner's returned tree, and
//   the caller's closure variables are all still in scope inside it.
//
// Practical rule:
//   Reach for it when the value can only be known INSIDE the component — the
//   current mouse position, the current row index, the current field state —
//   and the caller must decide what that value looks like.
//
// Common trap:
//   `render={value => <Thing v={value} />}` written inline is a NEW FUNCTION on
//   every parent render, so any memo below it never skips, and any component
//   receiving it as a prop re-renders forever. §7 proves it.
//
// The mental picture:
//
//   normal component            render prop
//   ────────────────            ───────────
//   props in  → JSX out         props in  → your function is CALLED
//   caller passes data          caller passes a FUNCTION
//   component owns markup       component owns state, caller owns markup
//   share logic? copy it        share logic? render the same component again


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM IT WAS INVENTED FOR
// ══════════════════════════════════════════════════════════════════

console.log("§3 — three components, one identical block of logic:\n");

// This is the block. In 2017 it lived in componentDidMount/componentWillUnmount;
// today it would be a useEffect. Either way it is the same code, three times.
function mouseTrackingLogic(setPos) {
  const onMove = event => setPos({ x: event.clientX, y: event.clientY });
  window.addEventListener("mousemove", onMove);
  return function cleanup() {
    window.removeEventListener("mousemove", onMove);
  };
}

// Prove the size instead of asserting it — read the function's own source:
const logicLines = String(mouseTrackingLogic).trim().split("\n").length;
const consumers = ["<Cursor>", "<Tooltip>", "<DragPreview>"];

console.log("    the shared block is", logicLines, "lines of source");
console.log("    components that need it:", consumers.join(", "));
console.log("    duplicated lines across the app:", logicLines * consumers.length);
console.log("    lines if ONE component owned it:", logicLines);
console.log("    lines saved:", logicLines * consumers.length - logicLines);
console.log("\n  And duplication is the small half of the problem. The real cost is");
console.log("  that the bug fixed in <Cursor> — a listener never removed, say —");
console.log("  stays alive in the other two, forever, until somebody notices.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE RENDER PROP VERSION
// ══════════════════════════════════════════════════════════════════

console.log("§4 — one owner, three callers:\n");

// ── a small React, enough to prove everything here ────────────────
function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}

function createRenderer() {
  const counts = {};
  const prevProps = {};
  const memoized = new Set();
  let skips = 0;

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
    if (typeof type === "function") {
      const name = type.name;
      if (memoized.has(name) && name in prevProps && shallowEqual(prevProps[name], props)) {
        skips++;
        return ["<SKIPPED>"];
      }
      prevProps[name] = props;
      counts[name] = (counts[name] || 0) + 1;
      return render(type(props));
    }
    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }

  return {
    render,
    memo: name => memoized.add(name),
    count: n => counts[n] || 0,
    skips: () => skips,
  };
}

// The owner. It holds the state; it does not know what a cursor looks like.
let mousePosition = { x: 0, y: 0 };          // stands in for useState
function MousePosition(props) {
  return props.render(mousePosition);        // ← the pattern, one line
}

const r1 = createRenderer();
mousePosition = { x: 120, y: 40 };

const cursorOut = r1.render(
  h(MousePosition, { render: pos => h("span", null, `dot at ${pos.x},${pos.y}`) })
);
const tooltipOut = r1.render(
  h(MousePosition, { render: pos => h("div", null, `tooltip near ${pos.x}`) })
);
const dragOut = r1.render(
  h(MousePosition, { render: pos => h("img", null, `ghost ${pos.y}px down`) })
);

console.log("    <Cursor>      →", JSON.stringify(cursorOut));
console.log("    <Tooltip>     →", JSON.stringify(tooltipOut));
console.log("    <DragPreview> →", JSON.stringify(dragOut));
console.log("\n    MousePosition rendered", r1.count("MousePosition"), "times — one implementation,");
console.log("    three completely different outputs, and the listener logic exists once.");
console.log("\n  Read the three render props again: each one closes over the caller's");
console.log("  own scope. That is the thing props alone cannot do — you are not");
console.log("  passing DATA down, you are passing a HOLE for data to arrive in.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — children-AS-A-FUNCTION IS THE SAME PATTERN
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the prop does not have to be called `render`:\n");

//   <MousePosition>{pos => <p>{pos.x}</p>}</MousePosition>
//
// `children` is just a prop. If you put a function between the tags, children
// IS that function — and the component calls it exactly the same way.

function MouseChildren(props) {
  if (typeof props.children !== "function") {
    throw new Error("<MouseChildren> expects a function as its child");
  }
  return props.children(mousePosition);
}

const r2 = createRenderer();
const childFnOut = r2.render(
  h(MouseChildren, null, pos => h("span", null, `dot at ${pos.x},${pos.y}`))
);

console.log("    typeof children  :", typeof h(MouseChildren, null, () => {}).props.children);
console.log("    output           :", JSON.stringify(childFnOut));
console.log("    identical to §4? :", JSON.stringify(childFnOut) === JSON.stringify(cursorOut));

let childTypeError = null;
try {
  r2.render(h(MouseChildren, null, h("span", null, "oops, an element")));
} catch (e) { childTypeError = e.message; }
console.log("    passing an element instead:", JSON.stringify(childTypeError));

console.log("\n  Which to pick? `children` reads better at the call site and is what");
console.log("  react-window and Formik use. A named `render` prop is clearer when the");
console.log("  component takes MORE THAN ONE — e.g. renderRow and renderEmpty — and");
console.log("  you cannot have two `children`. That is the whole difference.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE PYRAMID OF DOOM
// ══════════════════════════════════════════════════════════════════

console.log("§6 — what happens when you need three of them:\n");

// Each render prop is a nesting level. Three pieces of shared state — mouse,
// window size, auth — and your component is four levels deep before it renders
// anything of its own.
const providers = ["MousePosition", "WindowSize", "AuthState"];

const pyramid = providers
  .map((name, i) => "  ".repeat(i) + `<${name}>{v${i + 1} => (`)
  .concat(["  ".repeat(providers.length) + "<Widget mouse={v1} size={v2} user={v3} />"])
  .concat(providers.map((_, i) => "  ".repeat(providers.length - 1 - i) + ")}</" + providers[providers.length - 1 - i] + ">"))
  .join("\n");

console.log(pyramid.split("\n").map(l => "      " + l).join("\n"));

const renderPropDepth = providers.length;
const hooksVersion = providers.map(n => `  const v = use${n}();`);
const hooksDepth = 0;

console.log("\n      // the same thing with hooks:");
console.log(hooksVersion.map(l => "      " + l).join("\n"));
console.log("      " + "  <Widget mouse={v1} size={v2} user={v3} />");

console.log("\n    nesting levels — render props:", renderPropDepth, " hooks:", hooksDepth);
console.log("\n  This is the reason hooks exist, stated exactly: the render-prop");
console.log("  version's shape depends on HOW MANY pieces of logic you compose, and");
console.log("  the hook version's shape does not. Three is annoying; six is a wall.");
console.log("\n  Two more costs of the pyramid, which people forget:");
console.log("    • every level is a real component, so it is a real re-render");
console.log("    • v1, v2, v3 are only in scope INSIDE the innermost callback, so");
console.log("      you cannot pull one out into a variable at the top of the file\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE INLINE ARROW DESTROYS memo
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the performance trap, counted:\n");

// A memoized child receiving a render prop:
//
//   ❌ <Chart renderTooltip={d => <T d={d} />} />     ← new function every render
//   ✅ const renderTooltip = useCallback(d => <T d={d} />, []);
//      <Chart renderTooltip={renderTooltip} />
//
// memo compares props with Object.is. Two identical arrow functions are two
// different objects, so the comparison fails every single time.
// → 05_optimization-techniques/02_referential-equality-problem.js

function Chart(props) { return h("canvas", null, "chart"); }

const inlineR = createRenderer();
inlineR.memo("Chart");
for (let i = 0; i < 5; i++) {
  inlineR.render(h(Chart, { data: "static", renderTooltip: d => h("div", null, d) }));
  //                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ fresh, every time
}

const stableR = createRenderer();
stableR.memo("Chart");
const renderTooltip = d => h("div", null, d);        // stands in for useCallback
for (let i = 0; i < 5; i++) {
  stableR.render(h(Chart, { data: "static", renderTooltip }));
}

console.log("    5 parent renders, memoized <Chart>:");
console.log("      inline arrow render prop → Chart rendered", inlineR.count("Chart"), "/ 5, skipped", inlineR.skips(), "🐛");
console.log("      stable function          → Chart rendered", stableR.count("Chart"), "/ 5, skipped", stableR.skips(), "✅");
console.log("\n  The memo is present in both. In the first one it is pure overhead:");
console.log("  a comparison paid five times that never once succeeds.");
console.log("\n  And the fix is worse than it looks. useCallback on the render prop");
console.log("  means the callback closes over stale values unless every dependency");
console.log("  is listed — so you have traded a re-render problem for a staleness");
console.log("  problem. A custom hook has neither, because there is no prop.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT HOOKS REPLACED, AND WHAT THEY DID NOT
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the four cases render props still win:\n");

// Hooks won the LOGIC-SHARING job outright:
//
//   ❌ <MousePosition render={pos => <Dot {...pos} />} />
//   ✅ const pos = useMousePosition();  return <Dot {...pos} />;
//
// No wrapper component, no nesting, no prop, no memo trap, and the value is a
// plain variable you can pass anywhere in the function. If the only thing a
// render prop gives you is a value, delete it and write a hook.
//
// But a hook returns a value ONCE per component render. Four jobs need a
// function that can be called MANY times, or called with arguments only the
// library knows:

const stillWins = [
  ["per-item callbacks",
   "react-window calls children({ index, style }) once per visible row.",
   "A hook cannot be called 200 times with 200 different arguments — that is a loop, and hooks cannot run in loops."],
  ["the caller must render, not just read",
   "<AnimatePresence>, <Downshift>, <Formik><Field> — the library needs your markup in ITS tree so it can wrap, measure, portal or animate it.",
   "A hook hands you a value and steps out of the tree entirely; it has nothing to wrap."],
  ["class components",
   "A library that must support class consumers cannot ship a hook.",
   "This is why 2018-era libraries shipped render props and kept them."],
  ["one child, N different shapes",
   "<Query> rendering loading / error / data through one callback.",
   "Doable with a hook too — this is the weakest of the four, and the one that actually got replaced."],
];

stillWins.forEach(([title, what, why], i) => {
  console.log(`    ${i + 1}. ${title}`);
  console.log(`       ${what}`);
  console.log(`       → ${why}`);
});

// Prove case 1 — the per-item callback that has no hook equivalent:
const rowCalls = [];
function VirtualList(props) {
  const rows = [];
  for (let index = props.start; index < props.start + props.visible; index++) {
    rowCalls.push(index);
    rows.push(props.children({ index, style: { top: index * 32 } }));   // ← called N times
  }
  return rows;
}

const r3 = createRenderer();
const listOut = r3.render(
  h(VirtualList, { start: 100, visible: 4 },
    ({ index, style }) => h("div", null, `row ${index} @ ${style.top}px`))
);

console.log("\n    react-window's actual API, simulated:");
const rowText = listOut.filter(s => s.startsWith("row "));
console.log("      rows produced:", rowText.length);
console.log("      output       :", JSON.stringify(rowText.slice(0, 2)), "…");
console.log("      one callback, called", rowCalls.length, "times with different arguments.");
console.log("      There is no hook shape that does this. → 05_optimization-techniques/07");
console.log("\n  The senior sentence: hooks replaced render props for SHARING LOGIC.");
console.log("  Render props survive where the caller's MARKUP has to live inside the");
console.log("  library's tree, or has to be produced more than once per render.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHERE YOU STILL MEET IT IN 2025
// ══════════════════════════════════════════════════════════════════
//
//   react-window / react-virtuoso   children({ index, style })
//   Formik                          <Field>{({ field, meta }) => …}</Field>
//   Framer Motion                   <AnimatePresence> with a function child
//   Downshift                       the canonical render-prop library
//   React Router v5                 <Route render={…} />  ← v6 deleted it
//   Recharts / visx                 per-datum render callbacks
//   Error boundaries                fallbackRender in react-error-boundary
//                                   → 08_error-boundaries.js
//
// Two of those are worth a sentence each in an interview:
//
//   • React Router v5 → v6 is the clearest before/after in the ecosystem.
//     v5: <Route path="/u/:id" render={({ match }) => <User id={match.params.id} />} />
//     v6: <Route path="/u/:id" element={<User />} />  + useParams() inside User.
//     The render prop existed ONLY to pass match down. A hook did it better.
//     → 07_react-router-v6/02_route-params-and-useparams.js
//
//   • react-error-boundary keeps BOTH: `fallback` (an element) and
//     `fallbackRender` (a function receiving the error). The function form
//     survives because the value — the error — cannot exist before the render.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A memoized subtree that never skips:
//   An inline render prop. Every comparison fails. → §7.
//
// Bug 2 — "Functions are not valid as a React child":
//   You passed a function as children to a component that renders `children`
//   directly instead of calling it. The error is React's, and it means exactly
//   what it says. → §5.
//
// Bug 3 — Stale values inside the callback:
//   useCallback on the render prop with an incomplete dependency array. The
//   callback closes over last render's state. → §7.
//
// Bug 4 — The whole subtree remounts on every keystroke:
//   The render prop returns a DIFFERENT component type on some branch, so
//   reconciliation unmounts and remounts instead of updating.
//   → 01_react-fundamentals/03_reconciliation-algorithm.js
//
// Bug 5 — Pyramid + early return = unreachable code:
//   Inside four nested callbacks, `return null` returns from the CALLBACK, not
//   from the component. People expect it to short-circuit the whole render.
//
// Bug 6 — Two `children` props:
//   <Comp children={fn}>{other}</Comp>. JSX children win and silently
//   overwrite the prop. Pick one form.
//
// Bug 7 — Migrating a render prop to a hook changes WHERE the state lives:
//   The render-prop version had one <MousePosition> instance shared by the
//   subtree; ten components calling useMousePosition() create ten listeners.
//   The fix is a context provider, not a hook per component. → 05_provider-pattern.js


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The problem:
assert(logicLines === 7, "the shared block really is 7 lines of source");
assert(logicLines * consumers.length === 21, "3 copies = 21 duplicated lines 🐛");

// One owner, three outputs:
assert(r1.count("MousePosition") === 3, "one component, rendered by three callers");
assert(cursorOut[1] === "dot at 120,40", "the caller's markup received the owner's state");
assert(JSON.stringify(cursorOut) !== JSON.stringify(tooltipOut),
  "same component, different output — the caller decided ✅");

// children as a function:
assert(typeof h(MouseChildren, null, () => {}).props.children === "function",
  "a function between the tags IS props.children");
assert(JSON.stringify(childFnOut) === JSON.stringify(cursorOut),
  "children={fn} and render={fn} are the same pattern");
assert(childTypeError === "<MouseChildren> expects a function as its child",
  "guard the shape — the failure is otherwise silent");

// The pyramid:
assert(renderPropDepth === 3 && hooksDepth === 0,
  "3 pieces of shared logic → 3 nesting levels, or 0 with hooks");
assert(pyramid.split("\n")[2] === "    <AuthState>{v3 => (",
  "the third provider sits two indents in — one level per piece of shared logic");

// The memo trap:
assert(inlineR.count("Chart") === 5 && inlineR.skips() === 0,
  "inline arrow render prop → memo skips NOTHING 🐛");
assert(stableR.count("Chart") === 1 && stableR.skips() === 4,
  "stable function → 1 render, 4 skips ✅");

// The case hooks cannot cover:
assert(rowCalls.length === 4, "one children function, called once per visible row");
assert(rowCalls.join() === "100,101,102,103", "...with the index the library chose, not the caller");
assert(rowText[0] === "row 100 @ 3200px", "...and arguments only the library can compute");

console.log("§11 — mini assertions passed for: Render Props Pattern");
console.log("\n  The pair that captures it: 21 duplicated lines became 7, and 3 pieces");
console.log("  of shared logic that cost 3 nesting levels cost 0 with hooks — which");
console.log("  is why the pattern lost, everywhere except the render callback that");
console.log("  gets called 4 times with 4 different arguments.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the render props pattern?", answer:
//
//   "A component takes a function as a prop and calls it with its internal
//    state, so the component owns the behaviour and the caller owns the
//    markup. <MousePosition render={pos => <Dot {...pos} />} />. And children
//    is just a prop, so <MousePosition>{pos => …}</MousePosition> is the exact
//    same pattern — react-window and Formik use that form.
//
//    It was invented to solve logic sharing before hooks. If three components
//    need mouse tracking, the alternatives were copying the effect into all
//    three or wrapping them in an HOC, and render props were the cleanest of
//    the bad options — one implementation, and each caller renders whatever it
//    wants with the value.
//
//    Two things killed it for that job. First, composition: every piece of
//    shared logic is a nesting level, so three of them is a pyramid, and the
//    values only exist inside the innermost callback. Hooks are flat — three
//    lines, no wrappers, and the values are ordinary variables. Second,
//    performance: an inline render prop is a new function identity every
//    render, so any memo underneath it never skips. Fixing that with
//    useCallback trades a re-render problem for a stale-closure one.
//
//    But I wouldn't say it's dead, because it survives in a specific shape:
//    when the callback has to be called MORE THAN ONCE per render, or with
//    arguments only the library can produce. react-window calls
//    children({ index, style }) once per visible row — a hook can't be called
//    two hundred times in a loop. Same for anything where your markup has to
//    live inside the library's tree so it can be wrapped, measured, portalled
//    or animated: AnimatePresence, Downshift, Formik's Field. Hooks give you a
//    value and step out of the tree; those libraries need to stay in it.
//
//    The clean before/after is React Router. v5 had
//    <Route render={({ match }) => <User id={match.params.id} />} />; v6 has
//    <Route element={<User />} /> and useParams() inside. The render prop
//    existed only to pass a value down, so a hook deleted it."
//
// Naming the surviving cases — and WHY they survive — is what separates this
// from a history lesson.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. render prop vs children-as-a-function?
// A1. Identical mechanism. `children` reads better; a named prop is necessary
//     when you need more than one callback (renderRow + renderEmpty).
//
// Q2. Why are render props worse than hooks for sharing logic?
// A2. Nesting per piece of logic, an extra component per level, values trapped
//     in the innermost closure, and a new function identity every render.
//
// Q3. Are render props dead?
// A3. No — per-item callbacks (react-window), libraries that must wrap your
//     markup, and class-component support all still need them.
//
// Q4. Why can't a hook replace react-window's children?
// A4. Hooks run once per component render and cannot run in a loop. The row
//     callback must be invoked once per visible row, with different arguments.
//
// Q5. What's the performance trap?
// A5. Inline arrow → new identity → memo below never skips, and the callback
//     itself re-creates its subtree.
//
// Q6. How is this different from a compound component?
// A6. Compound components share state through context and let the caller
//     arrange COMPONENTS. Render props pass state through a function call and
//     let the caller produce markup from a VALUE. Many libraries use both.
//
// Q7. Can you type a render prop well?
// A7. Yes, better than an HOC — the callback's parameter type is explicit, so
//     there is no prop-injection to infer. That is a real advantage over 03.
//
// Q8. What replaced <Route render={…}>?
// A8. <Route element={…}> plus useParams/useLocation. The callback only
//     existed to pass values down.
//
// Q9. What happens if you migrate a shared render prop to a hook naively?
// A9. You multiply the state. One <MousePosition> served a whole subtree; ten
//     useMousePosition() calls create ten listeners. Use context. → 05
//
// Q10. Does a render prop create a component boundary?
// A10. The OWNER is a component; the callback is not. Its output belongs to
//      the owner's render, so React sees no extra boundary for the markup.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Render prop, in one line?
//   Back : A prop that is a function; the component calls it with its state
//          and returns the result.
//
// Flashcard 2:
//   Front: children={fn} vs render={fn}?
//   Back : Same pattern. children reads better; named props let you have more
//          than one.
//
// Flashcard 3:
//   Front: What problem did it solve?
//   Back : Sharing stateful logic before hooks existed.
//
// Flashcard 4:
//   Front: Why did hooks win?
//   Back : Flat composition. N pieces of logic = N nesting levels vs 0.
//
// Flashcard 5:
//   Front: The performance trap?
//   Back : Inline arrow = new identity every render = memo never skips.
//
// Flashcard 6:
//   Front: Name a render prop that cannot become a hook.
//   Back : react-window's children({ index, style }) — called once per row.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Hooks replaced it for sharing logic. It survives where the
//          callback runs more than once per render, or where the library must
//          wrap your markup."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write <WindowSize render={…} />. Then rewrite it as useWindowSize().
//   Compare the two call sites side by side.
//
// Task 2:
//   Nest three render-prop components and count the closing brackets. Then
//   flatten it with three hooks.
//
// Task 3:
//   Memoize a child, pass it an inline render prop, and log its renders.
//   Hoist the function and log again. You should see 5 → 1.
//
// Task 4:
//   Build a mini <VirtualList> whose children is called once per visible row.
//   Then try to express it as a hook and write down exactly where you get stuck.
//
// Task 5:
//   Convert a <Route render={…}> from React Router v5 to v6's element + hooks.
//   → 07_react-router-v6/02_route-params-and-useparams.js
//
// Task 6:
//   Take one render-prop component and give it BOTH APIs — a hook for the
//   value and a component for the markup case. That is what modern libraries
//   ship. → 11_headless-components.js
//
// Task 7:
//   Replace a shared <MousePosition> with a hook in ten components, then count
//   the mousemove listeners. Fix it with context.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The prop is a function. The component calls it with its state, and the
//   caller decides the markup.
//
// If you remember the common bug:
//   An inline arrow render prop is a new identity every render, so every memo
//   below it is dead weight.
//
// If you remember the professional framing:
//   Hooks replaced render props for sharing logic — flat instead of nested,
//   no prop identity to manage. Render props survive exactly where a value
//   must be produced more than once per render, or where the caller's markup
//   has to live inside the library's tree.
//
// NEXT TOPIC -> 03_higher-order-components-hoc.js
