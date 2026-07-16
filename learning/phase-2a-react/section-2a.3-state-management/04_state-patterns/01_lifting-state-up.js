// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  01_lifting-state-up.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Lifting state up
//
// WHAT YOU WILL MASTER HERE:
//   1. The rule: state lives at the closest common ANCESTOR
//   2. Two sources of truth desyncing — PROVEN
//   3. The cost of lifting: everything below re-renders
//   4. Lifting too far — the opposite mistake, and it is more common
//   5. The algorithm for finding the right level
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/01_lifting-state-up.js"
//
// This is the foundation of the whole section. Redux, Zustand, and Context
// are all answers to "lifting hurt — now what?"


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Lifting state up:
// When two components need the same state, move it to their closest common
// ancestor and pass it down as props.
//
// If interviewer says "explain it simply", say:
// "If two siblings need the same value, neither can own it — so the parent
//  owns it and passes it down. The children become controlled."
//
// If interviewer asks "why does it matter?", say:
// "Because it is the fix for two sources of truth. Two components each
//  holding their own copy WILL desync — not might, will. And because the
//  cost of lifting is what created every state library: once the state is
//  five levels up, you are prop drilling, and that pain is where Context and
//  Redux come from."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   state lives at the closest COMMON ANCESTOR
//
// The picture:
//
//   ❌ two sources of truth          ✅ lifted
//
//        <Page>                        <Page>  ← owns `filter`
//       /      \                      /      \
//   <Filter>  <List>              <Filter>  <List>
//   [filter]  [filter]            filter=   filter=
//    ↑ its own  ↑ its own         onChange=
//
// Runtime rule:
//   Data flows DOWN as props, events flow UP as callbacks. There is no other
//   direction. A child cannot reach into a parent or a sibling.
//
// Practical rule:
//   Find the components that need the state. Find their closest common
//   ancestor. Put it there. Not higher.
//
// The trade — say this and you sound senior:
//   Lifting solves correctness and costs performance. The state moved UP, so
//   now every render of the owner re-renders EVERYTHING below it, including
//   the components that do not care.
//
// Common trap:
//   Lifting to the ROOT "just in case". Now a keystroke in a search box
//   re-renders your entire app. → §6


// ══════════════════════════════════════════════════════════════════
// § 3 — A MINI REACT WITH A TREE
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const fibers = new Map();
  const renderCounts = new Map();

  function component(name, fn) {
    if (!fibers.has(name)) fibers.set(name, { hooks: [], cursor: 0 });
    renderCounts.set(name, (renderCounts.get(name) ?? 0) + 1);
    const fiber = fibers.get(name);
    fiber.cursor = 0;
    current = fiber;
    const out = fn();
    current = null;
    return out;
  }

  let current = null;
  let rootRender = null;

  function useState(initial) {
    const fiber = current;
    const slot = fiber.cursor++;
    if (!(slot in fiber.hooks)) fiber.hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(fiber.hooks[slot].value) : next;
      if (Object.is(value, fiber.hooks[slot].value)) return;
      fiber.hooks[slot].value = value;
      if (rootRender) rootRender();
    };
    return [fiber.hooks[slot].value, setState];
  }

  return {
    component, useState,
    setRoot: (fn) => { rootRender = fn; },
    renders: (name) => renderCounts.get(name) ?? 0,
    reset: () => renderCounts.clear(),
    total: () => [...renderCounts.values()].reduce((a, b) => a + b, 0),
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — TWO SOURCES OF TRUTH DESYNC
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same value owned twice:\n");

// ❌ Each sibling owns its own copy of `filter`.
function notLifted() {
  const R = createMiniReact();
  let setFilterInInput;
  const rendered = {};

  const render = () => {
    R.component("Page", () => {
      R.component("FilterInput", () => {
        const [filter, setFilter] = R.useState("");
        setFilterInInput = setFilter;
        rendered.input = filter;
      });
      R.component("ProductList", () => {
        const [filter] = R.useState("");        // ← its OWN, separate state
        rendered.list = filter;
      });
    });
  };
  R.setRoot(render);
  render();

  setFilterInInput("shoes");                     // the user types
  render();
  return rendered;
}

// ✅ The parent owns it; both children receive it.
function lifted() {
  const R = createMiniReact();
  let setFilter;
  const rendered = {};

  const render = () => {
    R.component("Page", () => {
      const [filter, set] = R.useState("");      // ← ONE owner
      setFilter = set;

      R.component("FilterInput", () => { rendered.input = filter; });
      R.component("ProductList", () => { rendered.list = filter; });
    });
  };
  R.setRoot(render);
  render();

  setFilter("shoes");
  render();
  return rendered;
}

const split = notLifted();
const together = lifted();

console.log("  user types 'shoes' into the filter input:\n");
console.log("    NOT lifted → FilterInput shows:", JSON.stringify(split.input));
console.log("                 ProductList filters by:", JSON.stringify(split.list),
  "🐛 DESYNCED");
console.log("\n    lifted     → FilterInput shows:", JSON.stringify(together.input));
console.log("                 ProductList filters by:", JSON.stringify(together.list),
  "✅ in sync");

console.log("\n  The input says 'shoes' and the list is showing everything. Two");
console.log("  useState calls means two independent boxes — updating one has no");
console.log("  effect on the other. There is no wiring between siblings.");
console.log("\n  This is not a subtle bug. It is a GUARANTEED one: the moment");
console.log("  the same conceptual value has two owners, they will diverge on");
console.log("  the very first update. → §5\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — DATA DOWN, EVENTS UP
// ══════════════════════════════════════════════════════════════════
//
// Lifting has a shape, and it is always the same:
//
//   function Page() {
//     const [filter, setFilter] = useState("");     // ← 1. own it
//     return (
//       <>
//         <FilterInput value={filter} onChange={setFilter} />   {/* 2. down */}
//         <ProductList filter={filter} />                       {/* 2. down */}
//       </>
//     );
//   }
//
//   function FilterInput({ value, onChange }) {
//     return <input value={value} onChange={e => onChange(e.target.value)} />;
//     //                                    ↑ 3. events UP
//   }
//
// Three moves:
//   1. The ancestor owns the state.
//   2. The value flows DOWN as a prop.
//   3. Changes flow UP as a callback.
//
// The children are now CONTROLLED — they have no state of their own. That is
// exactly the controlled/uncontrolled distinction from
// 01_react-fundamentals/10, applied to components rather than DOM inputs.
//
// And notice: FilterInput is now REUSABLE and TESTABLE. It takes a value and
// a callback; it knows nothing about products. Lifting did not just fix the
// bug — it made the component a pure function of its props.


// ══════════════════════════════════════════════════════════════════
// § 6 — THE COST: EVERYTHING BELOW RE-RENDERS
// ══════════════════════════════════════════════════════════════════

console.log("§6 — lifting to the right level vs the root:\n");

// React's actual rule, stated exactly: when state changes, React re-renders
// the component that OWNS it, and every descendant. Nothing above, and no
// sibling subtrees. So "who re-renders" is purely a question of where the
// state lives in the tree.

const appTree = {
  name: "App",
  children: [
    { name: "Sidebar", children: [{ name: "Nav" }, { name: "UserCard" }] },
    { name: "MainContent", children: [
      { name: "SearchPanel", children: [
        { name: "SearchInput" }, { name: "SearchResults" },
      ] },
      { name: "Footer" },
    ] },
  ],
};

function findNode(node, name) {
  if (node.name === name) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

function subtreeNames(node, out = []) {
  out.push(node.name);
  for (const child of node.children ?? []) subtreeNames(child, out);
  return out;
}

function measureLift(ownerName) {
  // One setState in `ownerName` → the owner and its whole subtree re-render.
  const rerendered = subtreeNames(findNode(appTree, ownerName));
  const has = (n) => (rerendered.includes(n) ? 1 : 0);
  return {
    total: rerendered.length,
    rerendered,
    byComponent: {
      Sidebar: has("Sidebar"),
      Nav: has("Nav"),
      Footer: has("Footer"),
      SearchInput: has("SearchInput"),
    },
  };
}

const atRoot = measureLift("App");           // lifted "just in case"
const atPanel = measureLift("SearchPanel");  // lifted only as far as needed

console.log("  tree: App > [Sidebar > [Nav, UserCard],");
console.log("               MainContent > [SearchPanel > [SearchInput, SearchResults], Footer]]");
console.log("\n  ONE keystroke in SearchInput:\n");
console.log("    query owned by App         → components re-rendered:", atRoot.total);
console.log("      Sidebar:", atRoot.byComponent.Sidebar,
  "| Nav:", atRoot.byComponent.Nav, "| Footer:", atRoot.byComponent.Footer,
  "← 🐛 none of these care about the query");
console.log("\n    query owned by SearchPanel → components re-rendered:", atPanel.total);
console.log("      Sidebar:", atPanel.byComponent.Sidebar,
  "| Nav:", atPanel.byComponent.Nav, "| Footer:", atPanel.byComponent.Footer,
  "← ✅ untouched");

console.log("\n  Lifting to the root re-renders your Nav and Footer on every");
console.log("  keystroke in a search box. They receive nothing, they read");
console.log("  nothing, and they render anyway — because their PARENT rendered.");
console.log("\n  This is the trade nobody states clearly: lifting fixes");
console.log("  correctness by moving state UP, and everything below the owner");
console.log("  pays for it. The higher you lift, the more pays.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE ALGORITHM
// ══════════════════════════════════════════════════════════════════
//
// React's docs give this, and it is genuinely mechanical:
//
//   1. Identify every component that RENDERS something from this state.
//   2. Find their closest common ancestor.
//   3. Put the state there — or, if that ancestor makes no sense, in a
//      component ABOVE it in the common chain.
//   4. Pass it down. If that is painful, THEN reach for something else.
//
// Step 4 is the important one. The pain of step 4 is the entire reason the
// rest of this section exists:
//
//   drilling 2-3 levels        → just pass the prop. It is fine.
//   drilling with elements     → pass the ELEMENT as a prop instead → file 02
//   needed by many, changes rarely → Context → file 03
//   needed by many, changes often  → a store (Zustand/Redux) → files 04-09
//   it is SERVER data          → React Query → file 10
//
// Do not skip to step 5 because step 4 might hurt later. Ship the prop.

console.log("§7 — finding the level:\n");

const tree = {
  name: "App",
  children: [
    { name: "Header", children: [{ name: "Logo" }, { name: "CartBadge" }] },
    { name: "Main", children: [
      { name: "ProductList", children: [{ name: "ProductCard" }] },
      { name: "CartPanel", children: [{ name: "CartItem" }, { name: "Total" }] },
    ] },
  ],
};

function pathTo(node, target, path = []) {
  if (node.name === target) return [...path, node.name];
  for (const child of node.children ?? []) {
    const found = pathTo(child, target, [...path, node.name]);
    if (found) return found;
  }
  return null;
}

function closestCommonAncestor(root, names) {
  const paths = names.map(n => pathTo(root, n));
  let ancestor = null;
  for (let i = 0; i < paths[0].length; i++) {
    const segment = paths[0][i];
    if (paths.every(p => p[i] === segment)) ancestor = segment;
    else break;
  }
  return ancestor;
}

const cases = [
  [["CartItem", "Total"], "both live inside CartPanel"],
  [["CartBadge", "CartItem"], "the badge is in the Header, the item in Main"],
  [["ProductCard", "Total"], "different subtrees entirely"],
];

for (const [components, why] of cases) {
  console.log(`  who needs it: ${components.join(" + ")}`);
  console.log(`    → closest common ancestor: <${closestCommonAncestor(tree, components)}>`);
  console.log(`      (${why})\n`);
}

console.log("  Notice how the answer CHANGES with the consumers. Cart state");
console.log("  lives in CartPanel — until the Header needs a badge, and then it");
console.log("  has to live in App. That is not a design failure; that is the");
console.log("  algorithm working. And it is exactly the moment people reach for");
console.log("  Context or a store: the common ancestor became the root.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — LIFTING TOO FAR
// ══════════════════════════════════════════════════════════════════
//
// The opposite mistake, and in my experience the more common one.
//
//   ❌ "Put all state in App so anything can use it."
//
//   What it costs:
//     • every state change re-renders the whole app → §6
//     • App becomes a 500-line component nobody wants to touch
//     • child components take fifteen props and are impossible to reuse
//     • you cannot tell what any component actually depends on
//     • prop drilling through five layers that just pass things along
//
//   The signal you have lifted too far:
//     A component receives a prop it does not use, purely to pass it down.
//     That component is now coupled to a feature it knows nothing about.
//
//   The signal you have not lifted far enough:
//     You are trying to sync two useStates with an effect:
//
//       useEffect(() => { setLocalFilter(props.filter); }, [props.filter]);
//
//     That effect is a red flag. It means the value has two owners and you
//     are papering over it. React's docs are blunt: this is an anti-pattern.
//     Either lift it, or accept the child owns it — not both.
//
// State should live as LOW as possible, but no lower. Colocate by default,
// lift when forced, and only as far as forced.

console.log("§8 — the sync-two-states anti-pattern:\n");

// The bug: a child mirrors a prop into its own state.
function mirroredState() {
  let propFilter = "shoes";
  let localFilter = "shoes";                  // the child's copy

  // The parent's value changes:
  propFilter = "boots";
  // ...the effect has NOT run yet. This render is inconsistent:
  const duringRender = { propFilter, localFilter };
  // ...now the effect runs, causing a SECOND render:
  localFilter = propFilter;
  const afterEffect = { propFilter, localFilter };

  return { duringRender, afterEffect };
}

const mirror = mirroredState();
console.log("  useEffect(() => setLocalFilter(props.filter), [props.filter])\n");
console.log("    render 1 (prop changed):", JSON.stringify(mirror.duringRender),
  "🐛 out of sync");
console.log("    render 2 (effect ran)  :", JSON.stringify(mirror.afterEffect),
  "✅ but you rendered TWICE");
console.log("\n  Two renders, one of them showing stale data, and two owners of");
console.log("  one value. The fix is not a better effect — it is to decide who");
console.log("  owns it. Either the child owns it (do not pass the prop), or the");
console.log("  parent owns it (do not copy it into state).");
console.log("\n  If you genuinely need to reset child state when a prop changes,");
console.log("  the answer is key={id}, not an effect.");
console.log("  → 01_react-fundamentals/05_keys-in-lists.js §7\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL CODEBASES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Production
//   ───────────               ──────────
//   pass props down           composition first: pass the ELEMENT as a prop
//                             (<Layout sidebar={<Sidebar user={user}/>} />)
//                             which kills most drilling with no context
//                             → 02_prop-drilling-problem.js
//   re-render everything      React.memo on the expensive subtrees, so
//                             lifting costs less
//   n/a                       React Compiler auto-memoizes, which genuinely
//                             changes this calculus — the cost of lifting
//                             drops a lot when everything below is memoized
//                             for free
//   useState in the parent    useReducer once several fields move together
//                             → 02_built-in-hooks/06
//
// The React Compiler note is worth raising: much of the pressure to reach for
// Zustand/Jotai is really "lifting re-renders too much". If the compiler
// memoizes properly, plain lifted state gets viable again at larger scales.
// That is a genuinely current, opinionated thing to say.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The input says X and the list shows Y:
//   Two sources of truth. → §4.
//
// Bug 2 — A keystroke re-renders the whole app:
//   Lifted to the root. → §6.
//
// Bug 3 — A component takes props it never uses:
//   Drilling through. You lifted too far, or need composition. → §8.
//
// Bug 4 — An effect syncing a prop into state:
//   Two owners. Renders twice, shows stale data once. → §8.
//
// Bug 5 — App.jsx is 600 lines of useState:
//   Lifting "just in case". → §8.
//
// Bug 6 — A child cannot be reused because it takes 15 props:
//   Same cause.
//
// Bug 7 — Lifting SERVER data:
//   It is not state; it is a cache. Lifting it gives you a hand-rolled,
//   broken React Query. → 10_react-query-usequery-usemutation.js
//
// Bug 8 — Reaching for Redux at step 3:
//   You skipped "just pass the prop". Most state does not need a library.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The desync:
assert(split.input === "shoes", "the input updated its own state");
assert(split.list === "", "...and the list never heard about it 🐛");
assert(split.input !== split.list,
  "two useState calls = two boxes. They desync on the FIRST update.");

// The fix:
assert(together.input === together.list && together.input === "shoes",
  "one owner, one value, both children agree ✅");

// The cost:
assert(atRoot.byComponent.Nav === 1 && atPanel.byComponent.Nav === 0,
  "lifted to the root, the Nav re-renders on a keystroke it knows nothing about");
assert(atRoot.byComponent.Footer === 1 && atPanel.byComponent.Footer === 0,
  "so does the Footer");
assert(atRoot.total > atPanel.total,
  "lifting higher costs more renders — that IS the trade-off");
assert(atPanel.byComponent.SearchInput === 1,
  "...while the component that actually uses it renders either way");

// The algorithm:
assert(closestCommonAncestor(tree, ["CartItem", "Total"]) === "CartPanel",
  "both in CartPanel → the state lives there");
assert(closestCommonAncestor(tree, ["CartBadge", "CartItem"]) === "App",
  "a Header badge forces the SAME state up to App — the answer changes with " +
  "the consumers");

// The mirror anti-pattern:
assert(mirror.duringRender.propFilter !== mirror.duringRender.localFilter,
  "mirroring a prop into state: render 1 is INCONSISTENT 🐛");
assert(mirror.afterEffect.propFilter === mirror.afterEffect.localFilter,
  "...it corrects on render 2 — but you rendered twice and showed stale data");

console.log("§11 — mini assertions passed for: Lifting state up");
console.log("\n  The trade-off in two numbers: lifting to the root costs",
  atRoot.total, "renders");
console.log("  per keystroke;", atPanel.total, "at the right level. Same correctness.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is lifting state up?", answer like this:
//
//   "When two components need the same state, neither can own it — so it moves
//    to their closest common ancestor and flows down as props, with changes
//    flowing back up as callbacks. Data down, events up.
//
//    The bug it fixes is two sources of truth, and that's a guaranteed bug,
//    not a possible one. Two useState calls are two independent boxes, so the
//    moment one updates, the input says 'shoes' and the list is still showing
//    everything. There's no wiring between siblings.
//
//    The part people don't state is the trade-off: lifting fixes correctness
//    by moving state UP, and everything below the owner now re-renders when it
//    changes. So lifting to the root 'just in case' means a keystroke in a
//    search box re-renders your Nav and Footer, which read nothing from it.
//    The rule is: as low as possible, but no lower — find the closest common
//    ancestor, put it there, and not one level higher.
//
//    The opposite mistake is more common in my experience. Two tells: a
//    component receiving props it doesn't use, just to pass down — that's
//    coupling it to a feature it knows nothing about. And an effect syncing a
//    prop into local state, which means the value has two owners and you're
//    papering over it. That renders twice and shows stale data once. If you
//    need to reset on a prop change, use key, not an effect.
//
//    And lifting is where every state library comes from. Once the common
//    ancestor is the root and you're drilling five levels, that's the pain
//    Context and Redux exist for. But I'd try composition first — passing the
//    element as a prop kills most drilling with no library at all."
//
// Naming the re-render cost and the "lifted too far" tells is what lands.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is lifting state up?
// A1. Moving shared state to the closest common ancestor. Data down as props,
//     events up as callbacks.
//
// Q2. What bug does it fix?
// A2. Two sources of truth. Two useStates are two boxes and they desync on the
//     first update.
//
// Q3. What does it cost?
// A3. Everything below the owner re-renders when it changes. The higher you
//     lift, the more pays.
//
// Q4. How do you find the right level?
// A4. List the components that render from it, find their closest common
//     ancestor, put it there. The answer changes as consumers change.
//
// Q5. How do you know you lifted too far?
// A5. Components receive props they do not use, App becomes enormous, and a
//     keystroke re-renders unrelated subtrees.
//
// Q6. What about an effect that syncs a prop into state?
// A6. An anti-pattern. Two owners. Decide who owns it, and use key if you need
//     a reset on prop change.
//
// Q7. When do you stop lifting and reach for something else?
// A7. When passing the prop is genuinely painful. Try composition first, then
//     Context for rarely-changing values, then a store for frequent ones.
//
// Q8. Should you lift server data?
// A8. No. It is a cache, not state. React Query.
//
// Q9. Does React Compiler change this?
// A9. Meaningfully. Much of the pressure toward stores is really the
//     re-render cost of lifting. Free memoization makes lifted state viable
//     at larger scales.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is lifting state up?
//   Back : State at the closest common ancestor. Data down, events up.
//
// Flashcard 2:
//   Front: What bug does it fix?
//   Back : Two sources of truth — a guaranteed desync.
//
// Flashcard 3:
//   Front: What does it cost?
//   Back : Everything below the owner re-renders.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Lifting to the root "just in case".
//
// Flashcard 5:
//   Front: The "lifted too far" tell?
//   Back : A component takes a prop it does not use.
//
// Flashcard 6:
//   Front: An effect syncing a prop to state?
//   Back : An anti-pattern. Two owners. Use key to reset instead.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the re-render cost, and try composition before Context.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild §4's desync from memory. Two useStates, one concept. Watch them
//   diverge on the first update.
//
// Task 2:
//   Add React.memo to §6's Sidebar and Footer. How much does lifting to the
//   root cost now? That number is the argument for the React Compiler.
//
// Task 3:
//   Extend the §7 algorithm: given a tree and a list of consumers, output the
//   ancestor AND the drilling depth. Now you can measure "is this painful?"
//   instead of guessing.
//
// Task 4:
//   Take §8's mirrored state and fix it three ways: lift it, let the child
//   own it, and use key. When is each right?
//
// Task 5:
//   Build a 5-level tree and drill a prop through it. Then refactor to pass
//   the ELEMENT instead. Count the components that had to change.
//
// Task 6:
//   Explain in 60 seconds why the input says 'shoes' and the list shows
//   everything, to someone who thinks setState is broken.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The closest common ancestor. As low as possible, but no lower.
//
// If you remember the common bug:
//   Two useStates for one concept desync immediately. And an effect syncing a
//   prop into state means you never decided who owns it.
//
// If you remember the professional framing:
//   Lifting trades re-renders for correctness. The pain of lifting too far is
//   where Context and every state library came from.
//
// NEXT TOPIC -> 02_prop-drilling-problem.js
