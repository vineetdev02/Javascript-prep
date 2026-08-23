// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  09_shouldcomponentupdate.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: shouldComponentUpdate
//
// WHAT YOU WILL MASTER HERE:
//   1. The signature, the default, and the INVERTED return vs React.memo
//   2. What it blocks — and the four things it cannot block
//   3. It skips the whole SUBTREE, which is the part people underestimate
//   4. The mutation trap: why sCU makes state mutation catastrophic
//   5. Where it sits in the lifecycle, and what it broke that React had to fix
//   6. The hooks translation, function by function
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/09_shouldcomponentupdate.js"
//
// Prerequisites: 01_react-memo-when-to-use.js — this is the class-component
// ancestor of memo, and the comparison runs both ways in interviews.
// 10_purecomponent.js is this file's automatic version.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// shouldComponentUpdate:
// A class lifecycle method that receives the next props and state and returns a
// boolean — false tells React to skip re-rendering this component and its entire
// subtree.
//
// If interviewer says "explain it simply", say:
// "It's a manual veto on rendering. React calls it before every update with the
//  next props and state, and if you return false it doesn't call render at all.
//  The default is to always return true."
//
// If interviewer asks "why does it matter?", say:
// "Two reasons. Practically, it's still in every class-based codebase, and half
//  the React apps written before 2019 are class-based. Conceptually, it's the
//  clearest window into React's render model — it's the exact point where React
//  asks 'should I do this work?', which is what memo, PureComponent and the
//  React Compiler all automate. And the one detail that catches people is that
//  its return value is INVERTED relative to memo's comparator: true here means
//  'yes, render', while true in memo means 'props are equal, skip'."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   sCU is a VETO — true means render
//
// The signature:
//
//   shouldComponentUpdate(nextProps, nextState, nextContext) {
//     return true;                    // ← the default, if you don't define it
//   }
//
//   Inside it, `this.props` and `this.state` are the CURRENT (old) values, and
//   the arguments are the incoming ones. Getting that backwards is a real bug.
//
// Runtime rule:
//   Return false and React skips render() AND the reconciliation of this
//   component's whole subtree. It is a much bigger hammer than it looks.
//
// Practical rule:
//   Never hand-write a deep comparison in it. If you find yourself doing that,
//   the real problem is that you are mutating state, or that the state shape is
//   wrong.
//
// Common trap:
//   The inverted return. Someone converts a class to a function component and
//   copies the sCU body into memo's comparator. Every meaning flips, and the
//   component either freezes completely or never skips.
//
//   sCU  (prev, next) => true   →  RENDER
//   memo (prev, next) => true   →  props are EQUAL, SKIP
//
//   Say it as: "sCU answers 'should I update?'. memo's comparator answers
//   'are these equal?'. Opposite questions, so opposite answers."


// ══════════════════════════════════════════════════════════════════
// § 3 — THE DEFAULT, AND THE VETO
// ══════════════════════════════════════════════════════════════════

console.log("§3 — sCU in action:\n");

// A miniature React that honours shouldComponentUpdate.
class Component {
  constructor(props) { this.props = props; this.state = {}; this.renders = 0; }
  shouldComponentUpdate() { return true; }       // ← React's default
  render() { this.renders++; }
}

function reactUpdate(instance, nextProps, nextState = instance.state) {
  const should = instance.shouldComponentUpdate(nextProps, nextState);
  instance.props = nextProps;                     // props update either way...
  instance.state = nextState;                     // ...and so does state
  if (!should) return "SKIPPED";                  // ← render() is never called
  instance.render();
  return "RENDERED";
}

class Default extends Component {}
class Vetoing extends Component {
  shouldComponentUpdate(nextProps) {
    return nextProps.userId !== this.props.userId;   // only re-render on a real change
  }
}

const d = new Default({ userId: 1 });
const v = new Vetoing({ userId: 1 });

const updates = [{ userId: 1 }, { userId: 1 }, { userId: 2 }, { userId: 2 }];
for (const p of updates) { reactUpdate(d, p); reactUpdate(v, p); }

console.log("    4 parent updates, userId changes once:");
console.log("      default sCU (always true) → renders:", d.renders, "🐛");
console.log("      sCU comparing userId      → renders:", v.renders, "✅");

console.log("\n  ⚠️ Note what still happened in the skipped case: this.props and");
console.log("  this.state were UPDATED. sCU does not reject the new values — it only");
console.log("  skips the render. So if you return false and the data really did");
console.log("  change, the component now holds correct props and shows stale output,");
console.log("  with no error and no warning. That silence is why a wrong sCU is worse");
console.log("  than no sCU.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — IT SKIPS THE WHOLE SUBTREE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the blast radius:\n");

// Returning false does not just skip one render(). React never reconciles the
// children either — so every descendant is frozen with its previous output.
// That is the power AND the danger.

function renderTree(node, sCUReturns, depth = 0, out = []) {
  if (depth === 0 || sCUReturns[node] !== false) {
    out.push(node);
    for (const child of TREE[node] || []) renderTree(child, sCUReturns, depth + 1, out);
  }
  return out;
}

const TREE = {
  App: ["Header", "Layout"],
  Layout: ["Sidebar", "Content"],
  Content: ["Toolbar", "Table"],
  Table: ["Row1", "Row2", "Row3"],
  Header: [], Sidebar: [], Toolbar: [], Row1: [], Row2: [], Row3: [],
};

const all = renderTree("App", {});
const vetoedAtLayout = renderTree("App", { Layout: false });

console.log("    no vetoes            →", all.length, "components rendered:", all.join(", "));
console.log("    Layout returns false →", vetoedAtLayout.length, "rendered:", vetoedAtLayout.join(", "));
console.log("      frozen:", all.filter(c => !vetoedAtLayout.includes(c)).join(", "));

console.log("\n  One `return false` near the root froze eight components. Two");
console.log("  consequences fall out:");
console.log("    ✅ It is a genuinely powerful optimization — one veto, whole subtree.");
console.log("    🐛 A wrong veto near the root freezes half your app, and the only");
console.log("       symptom is 'the UI doesn't update sometimes'. There is no error,");
console.log("       no warning, and the React DevTools show correct props on a");
console.log("       component displaying stale output.");
console.log("\n  memo has the same subtree behaviour — but memo is almost always");
console.log("  applied to leaves and rows, while sCU was routinely put on containers.");
console.log("  Same mechanism, much worse blast radius by convention.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FOUR THINGS IT CANNOT BLOCK
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what gets through anyway:\n");

// 1. THE INITIAL RENDER — sCU is not called on mount. There is no "previous".
// 2. forceUpdate() — deliberately bypasses sCU. That is its entire purpose.
//                    (It skips sCU for THIS component; children still get theirs.)
// 3. CONTEXT — a consumer of the modern Context API re-renders when the value
//              changes even if an ancestor's sCU returned false. This was the
//              headline fix of the React 16.3 context API: the legacy context
//              was broken precisely because sCU could block it, so values got
//              silently stuck. Exactly the same "memo can't filter context"
//              rule from 01 §6.3.
// 4. A PARENT REMOUNTING IT — a changed key or component type unmounts and
//              mounts fresh. There is no update to veto.

class Blockable extends Component {
  shouldComponentUpdate() { return false; }      // veto EVERYTHING
}

const b = new Blockable({});
const log = [];

log.push(["initial mount", (b.render(), "RENDERED")]);          // sCU not consulted
log.push(["normal update", reactUpdate(b, { x: 1 })]);
log.push(["forceUpdate()", (b.render(), "RENDERED")]);          // bypasses sCU
log.push(["context change (consumer)", "RENDERED"]);            // bypasses sCU
log.push(["remount (key changed)", (b.render(), "RENDERED")]);

for (const [event, result] of log) {
  const mark = result === "RENDERED" ? "→ renders anyway" : "→ blocked ✅";
  console.log(`    ${event.padEnd(26)} ${mark}`);
}
console.log("\n    total renders on a component that vetoes everything:", b.renders, "🐛");
console.log("\n  The context row is the one worth knowing the history of. In legacy");
console.log("  context, an sCU:false anywhere between provider and consumer silently");
console.log("  blocked the update — which is why the API was rewritten in 16.3 to");
console.log("  subscribe consumers directly. That design decision is why memo and sCU");
console.log("  both fail to filter context today: it is intentional.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE MUTATION TRAP
// ══════════════════════════════════════════════════════════════════

console.log("§6 — why sCU makes mutation catastrophic:\n");

// Without sCU, mutating state and calling setState still re-renders — React
// re-renders on setState regardless. The bug is invisible.
// WITH a shallow-comparing sCU, the mutation makes prev and next the SAME
// object, the comparison says "equal", and the UI silently stops updating.

function shallowEqual(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(k => Object.is(a[k], b[k]));
}

class TodoList extends Component {
  shouldComponentUpdate(nextProps, nextState) {
    return !shallowEqual(this.state, nextState);
  }
}

// ❌ MUTATE
const mutating = new TodoList({});
mutating.state = { todos: ["a"] };
const mutatedNext = mutating.state;
mutatedNext.todos.push("b");                        // 🐛 same object, same array
console.log("    ❌ this.state.todos.push('b'); setState(this.state)");
console.log("       data is correct:", JSON.stringify(mutatedNext.todos));
console.log("       sCU says render? ", !shallowEqual(mutating.state, mutatedNext), "🐛 UI is frozen");

// ✅ REPLACE
const immutable = new TodoList({});
immutable.state = { todos: ["a"] };
const newNext = { todos: [...immutable.state.todos, "b"] };
console.log("\n    ✅ setState({ todos: [...this.state.todos, 'b'] })");
console.log("       sCU says render? ", !shallowEqual(immutable.state, newNext), "✅");

console.log("\n  This is the single best argument for immutability in class React,");
console.log("  and it is the same Object.is rule from 04_state-patterns/13 and from");
console.log("  02_referential-equality-problem.js. sCU does not create the rule — it");
console.log("  makes breaking it VISIBLE, by turning an invisible mutation into a");
console.log("  frozen UI.");
console.log("\n  It is also why a deep-comparison sCU is a trap rather than a fix:");
console.log("  it papers over mutation (a deep compare of a mutated object also says");
console.log("  'equal'), it costs O(n) on every update, and it can easily exceed the");
console.log("  render it was meant to save.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHERE IT SITS, AND WHAT IT BROKE
// ══════════════════════════════════════════════════════════════════
//
// The update lifecycle, in order:
//
//   static getDerivedStateFromProps(props, state)
//   shouldComponentUpdate(nextProps, nextState)      ← the veto. Return false
//   render()                                            and everything below is
//   getSnapshotBeforeUpdate(prevProps, prevState)       skipped.
//   [React commits to the DOM]
//   componentDidUpdate(prevProps, prevState, snapshot)
//
// Two rules that follow directly:
//
//   • sCU must be PURE and fast. It runs before every update. No setState, no
//     fetch, no DOM reads — a setState inside it is an infinite loop.
//   • componentDidUpdate does not run when you return false. Effects tied to
//     data changes silently stop, which is a second-order bug that is very hard
//     to trace back to sCU.
//
// The historical note worth having:
//   sCU is the reason React could not safely make rendering interruptible for
//   years. Concurrent rendering may start a render, abandon it, and start again
//   — so lifecycle methods that ran once per update, and were commonly written
//   with side effects in them, became unsafe. componentWillReceiveProps,
//   componentWillMount and componentWillUpdate were deprecated for exactly this
//   reason. sCU survived because it is (supposed to be) pure. That story is a
//   good answer to "why did hooks happen?".


// ══════════════════════════════════════════════════════════════════
// § 8 — THE HOOKS TRANSLATION
// ══════════════════════════════════════════════════════════════════
//
//   CLASS                              FUNCTION COMPONENT
//   ─────────────────────────────────  ─────────────────────────────────────────
//   shouldComponentUpdate (props only) React.memo(C)                        (01)
//   sCU with a custom comparison       React.memo(C, (prev, next) => ...)   (01)
//     ⚠️ and INVERT the return value
//   sCU comparing state                no equivalent — split the state, or
//                                      derive during render                 (03)
//   PureComponent                      React.memo with the default compare  (10)
//   Expensive value in render          useMemo                              (02)
//   Stable callback identity           useCallback                          (02)
//   forceUpdate()                      useReducer(x => x + 1, 0)  — rare
//
// The honest gap, and say it, because it is a good answer:
//   There is no hook that vetoes a render based on STATE. memo only sees props.
//   That is a deliberate design decision, not an omission: the class escape
//   hatch encouraged people to patch over bad state shape with a comparison
//   instead of fixing it. In hooks the answers are structural — split the state
//   so unrelated values do not share a render, derive instead of storing, move
//   state down. Which is 03's ladder, arrived at from a different direction.
//
// And in React 19 the Compiler applies memoization automatically from the
// dependency graph, so the entire category becomes a build-time concern.
// sCU is where this story starts and the Compiler is where it ends.

console.log("§8 — the same optimization, three eras:\n");
const eras = [
  ["2015 class", "shouldComponentUpdate(next) { return next.id !== this.props.id }", "manual, inverted"],
  ["2019 hooks", "memo(Row, (prev, next) => prev.id === next.id)", "manual, equality"],
  ["2024 compiler", "function Row({ id }) { ... }", "automatic"],
];
for (const [era, code, style] of eras) {
  console.log(`    ${era.padEnd(14)} ${style.padEnd(18)} ${code}`);
}
console.log("\n  Read the middle column: the return value flipped meaning between");
console.log("  row 1 and row 2. That is the migration bug this file exists to prevent.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The UI freezes after a class-to-function migration:
//   sCU's return value copied into memo's comparator. Inverted. → §2, §8.
//
// Bug 2 — "Sometimes the list doesn't update":
//   sCU comparing shallowly while the code mutates state. → §6.
//
// Bug 3 — A whole section of the page is stale:
//   A veto on a container component froze the subtree. → §4.
//
// Bug 4 — componentDidUpdate stopped firing:
//   sCU returned false, so the whole update was skipped, including the commit
//   phase callback. → §7.
//
// Bug 5 — Comparing the wrong side:
//   `nextProps.x !== nextProps.x` or using this.props where nextProps was
//   meant. Always false or always true. → §2.
//
// Bug 6 — Infinite loop:
//   setState inside shouldComponentUpdate. → §7.
//
// Bug 7 — sCU is slower than the render:
//   A deep comparison of a large object on every update. → §6.
//
// Bug 8 — A context value stopped propagating (legacy context):
//   An sCU in the middle of the tree. The reason the context API was rewritten.
//   → §5.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The veto:
assert(d.renders === 4, "the default sCU returns true → every update renders 🐛");
assert(v.renders === 1, "comparing userId → 1 render for 4 updates ✅");
assert(v.props.userId === 2,
  "...and props were still UPDATED on the skipped renders — that is why a wrong " +
  "sCU shows stale output with correct props 🐛");

// The subtree:
assert(all.length === 10, "the full tree is 10 components");
assert(vetoedAtLayout.length === 2,
  "ONE false on Layout froze 8 of them — sCU skips the entire subtree");

// What gets through:
assert(b.renders === 3,
  "a component vetoing everything still rendered on mount, forceUpdate and remount 🐛");

// The mutation trap:
assert(shallowEqual(mutating.state, mutatedNext) === true,
  "mutation makes prev and next the SAME object → sCU says 'equal' → frozen UI 🐛");
assert(mutatedNext.todos.length === 2, "...while the data is perfectly correct");
assert(shallowEqual(immutable.state, newNext) === false,
  "a new object → sCU says 'changed' → it renders ✅");

console.log("§10 — mini assertions passed for: shouldComponentUpdate");
console.log("\n  The pair that captures it: one `return false` on a container froze");
console.log("  eight components — and a single state mutation made the comparison");
console.log("  say 'equal' while the data was already correct. Silent, both of them.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is shouldComponentUpdate?", answer:
//
//   "It's the class-component lifecycle method React calls before every update,
//    with nextProps and nextState. Return false and it skips render entirely.
//    The default returns true, so React re-renders on every update.
//
//    The detail I'd lead with is that its return value is inverted relative to
//    React.memo's comparator. sCU answers 'should I update?' — true means
//    render. memo's comparator answers 'are these equal?' — true means skip.
//    Copying an sCU body into memo during a class-to-function migration freezes
//    the component completely, and it's a common bug.
//
//    Two things people underestimate. First, returning false skips the entire
//    SUBTREE, not just that component — in my example one false on a container
//    froze eight components. That's what makes it powerful and what makes a
//    wrong veto so dangerous, because there's no error: DevTools shows correct
//    props on a component rendering stale output.
//
//    Second, it doesn't reject the new props — this.props and this.state are
//    still updated. It only skips the render. So a wrong comparison gives you
//    correct data and a dead UI.
//
//    It also can't block four things: the initial render, since there's nothing
//    to compare; forceUpdate, which exists to bypass it; a remount from a
//    changed key; and context. That last one is historically interesting — the
//    legacy context API could be blocked by an sCU in the middle of the tree,
//    which is exactly why React 16.3 rewrote it so consumers subscribe directly.
//    It's the same reason memo can't filter context today.
//
//    The trap I'd warn about is that it makes state mutation catastrophic.
//    Without sCU, mutating and calling setState still re-renders. With a
//    shallow-comparing sCU, the mutation means prev and next are the same
//    object, so the comparison says 'equal' and the UI silently freezes. That's
//    the strongest practical argument for immutability in class React. And I
//    wouldn't fix it with a deep comparison — that hides the mutation, costs
//    O(n) per update, and often exceeds the render it saves.
//
//    In hooks, memo covers the props case, and there's deliberately no hook that
//    vetoes on state — because that escape hatch mostly let people paper over
//    bad state shape. The modern answers are structural: split the state, derive
//    instead of store, move state down. And React 19's compiler makes the whole
//    category automatic."
//
// The inverted return, the subtree blast radius, and the context history are
// the three things that make this more than a definition.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Signature and default?
// A1. shouldComponentUpdate(nextProps, nextState, nextContext) → boolean.
//     Defaults to true.
//
// Q2. How does its return value compare to memo's comparator?
// A2. Inverted. sCU true = render. memo comparator true = equal, so skip.
//
// Q3. What exactly does false skip?
// A3. render() and the reconciliation of the entire subtree — plus
//     componentDidUpdate for that update.
//
// Q4. Does it stop props from updating?
// A4. No. this.props and this.state are updated regardless. Only the render is
//     skipped.
//
// Q5. What can't it block?
// A5. Initial render, forceUpdate, a remount, and modern context updates.
//
// Q6. Why is mutation worse with sCU?
// A6. Prev and next become the same object, so a shallow compare says "equal"
//     and the UI freezes with correct data.
//
// Q7. Should you deep-compare in it?
// A7. No. It hides mutation bugs, costs O(n) per update, and often exceeds the
//     render it saves.
//
// Q8. Why must it be pure?
// A8. It runs before every update and, under concurrent rendering, a render can
//     be started and abandoned. A setState in it is an infinite loop.
//
// Q9. What's the hooks equivalent for state?
// A9. There isn't one, deliberately. Split state, derive, or move it down.
//
// Q10. Why did React deprecate componentWillUpdate and friends but keep sCU?
// A10. Those ran side effects once per update, which concurrent rendering can't
//      guarantee. sCU is pure, so it survives.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: sCU signature and default?
//   Back : (nextProps, nextState, nextContext) → boolean. Default true.
//
// Flashcard 2:
//   Front: sCU true vs memo comparator true?
//   Back : sCU true = RENDER. memo true = EQUAL, so SKIP. Inverted.
//
// Flashcard 3:
//   Front: What does false skip?
//   Back : render, the whole subtree, and componentDidUpdate.
//
// Flashcard 4:
//   Front: Does false stop props updating?
//   Back : No. Correct props, stale UI. Silent.
//
// Flashcard 5:
//   Front: Four things it can't block?
//   Back : Initial render, forceUpdate, remount, context.
//
// Flashcard 6:
//   Front: Why is mutation catastrophic with sCU?
//   Back : Same object → shallow compare says equal → frozen UI.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the inverted return, the subtree blast radius, and why the
//          context API was rewritten in 16.3.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write a class component with a counter and a sCU that returns false.
//   Confirm setState changes this.state but the screen never updates.
//
// Task 2:
//   Put a sCU returning false on a container with a deep subtree. Count how
//   many components freeze.
//
// Task 3:
//   Reproduce §6: mutate an array in state, call setState(this.state), and
//   watch a shallow sCU block the render.
//
// Task 4:
//   Convert a class with sCU to a function with memo. Copy the comparator body
//   verbatim first, watch it freeze, then invert it.
//
// Task 5:
//   Add a console.log to componentDidUpdate and confirm it stops firing when
//   sCU returns false.
//
// Task 6:
//   Put a context consumer under a component whose sCU returns false. Confirm
//   the consumer still updates, and explain why.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   sCU is a veto — true means render — and it is INVERTED relative to memo's
//   comparator.
//
// If you remember the common bug:
//   It skips the whole subtree, it does not stop props updating, and with
//   mutated state a shallow comparison silently freezes the UI.
//
// If you remember the professional framing:
//   sCU makes mutation visible rather than causing it, deep comparison is a trap
//   rather than a fix, and hooks deliberately removed the state-veto escape
//   hatch in favour of structural fixes.
//
// NEXT TOPIC -> 10_purecomponent.js
