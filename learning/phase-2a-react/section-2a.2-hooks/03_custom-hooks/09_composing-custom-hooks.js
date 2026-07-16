// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  09_composing-custom-hooks.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Composing custom hooks
//
// WHAT YOU WILL MASTER HERE:
//   1. Hooks compose because they FLATTEN — no wrapper hell
//   2. Why HOCs and render props lost (the diamond, drawn)
//   3. Custom hooks share LOGIC, never STATE — the #1 misconception
//   4. Building useSearch from four smaller hooks
//   5. When NOT to extract a hook
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/09_composing-custom-hooks.js"
//
// Prerequisite: 01_rules-of-hooks.js §8 — a custom hook borrows the CALLER's
// slots. Everything here follows from that.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Composing custom hooks:
// Custom hooks call other hooks, so behaviour composes by FUNCTION CALLS
// instead of by nesting components — which is why hooks replaced HOCs and
// render props.
//
// If interviewer says "explain it simply", say:
// "A custom hook is just a function that calls hooks. So building a bigger
//  hook from smaller ones is just calling them. The result is flat — three
//  hooks add three lines, not three layers of wrapper components."
//
// If interviewer asks "why does it matter?", say:
// "Because that flatness IS the reason hooks exist. HOCs and render props
//  solved the same problem — sharing stateful logic — by wrapping components,
//  and five behaviours meant five wrappers. Hooks compose linearly. And the
//  key thing people misunderstand: they share LOGIC, not STATE. Every caller
//  gets its own."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   composition by CALLS, not by NESTING
//
// The flattening — this is the whole idea:
//
//   function useSearch(url) {
//     const [query, setQuery] = useState("");        // slot 0
//     const debounced = useDebounce(query, 300);     // slots 1,2 (inside it)
//     const { data } = useFetch(url + debounced);    // slots 3,4,5
//     return { query, setQuery, data };
//   }
//
//   There is no useSearch hook list. All of those slots belong to the
//   COMPONENT that called useSearch. The hooks flatten into one linear list.
//   → 01_rules-of-hooks.js §8
//
// Runtime rule:
//   Because they flatten into the caller's list, the Rules of Hooks apply
//   inside custom hooks too. No conditionals, no loops, no early returns
//   above a hook — even three levels deep.
//
// Practical rule:
//   A custom hook is a function. If you can compose functions, you can
//   compose hooks. There is no special API.
//
// Common trap:
//   "Two components use useCounter, so they share the count." They do not.
//   Each component has its own fiber and its own hook list, so each gets its
//   own state. Custom hooks share the CODE, not the DATA. → §5


// ══════════════════════════════════════════════════════════════════
// § 3 — THE MINI REACT
// ══════════════════════════════════════════════════════════════════

function createFiber(name) {
  return { name, hooks: [], cursor: 0 };
}

function createMiniReact() {
  let current = null;                 // the fiber being rendered

  function useState(initial) {
    const fiber = current;
    const slot = fiber.cursor++;
    if (!(slot in fiber.hooks)) {
      fiber.hooks[slot] = { type: "state", value: initial, owner: fiber.name };
    }
    const setState = (next) => {
      const value = typeof next === "function" ? next(fiber.hooks[slot].value) : next;
      fiber.hooks[slot].value = value;
    };
    return [fiber.hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const fiber = current;
    const slot = fiber.cursor++;
    if (!(slot in fiber.hooks)) {
      fiber.hooks[slot] = { type: "effect", deps, owner: fiber.name };
      fn();
    }
  }

  function useRef(initial) {
    const fiber = current;
    const slot = fiber.cursor++;
    if (!(slot in fiber.hooks)) {
      fiber.hooks[slot] = { type: "ref", current: initial, owner: fiber.name };
    }
    return fiber.hooks[slot];
  }

  function render(fiber, component) {
    current = fiber;
    fiber.cursor = 0;
    const output = component();
    current = null;
    return output;
  }

  return { useState, useEffect, useRef, render };
}

const R = createMiniReact();


// ══════════════════════════════════════════════════════════════════
// § 4 — HOOKS FLATTEN
// ══════════════════════════════════════════════════════════════════

console.log("§4 — three hooks deep, one flat list:\n");

// The smallest hook — level 3.
function useToggle(initial) {
  const [on, setOn] = R.useState(initial);         // 1 slot
  return [on, () => setOn(o => !o)];
}

// Level 2 — composes useToggle.
function useDisclosure() {
  const [isOpen, toggle] = useToggle(false);       // → useToggle's 1 slot
  const [openCount, setOpenCount] = R.useState(0); // 1 slot
  return { isOpen, toggle, openCount, setOpenCount };
}

// Level 1 — composes useDisclosure.
function useModal(name) {
  const disclosure = useDisclosure();              // → 2 slots
  const lastOpened = R.useRef(null);               // 1 slot
  R.useEffect(() => {}, [name]);                   // 1 slot
  return { ...disclosure, lastOpened };
}

// The component.
const fiber = createFiber("SettingsPage");
R.render(fiber, () => {
  const [title] = R.useState("Settings");          // slot 0
  const modal = useModal("settings");              // slots 1,2,3,4
  const [theme] = R.useState("dark");              // slot 5
  return { title, modal, theme };
});

console.log("  SettingsPage");
console.log("    ├─ useState('Settings')");
console.log("    ├─ useModal()");
console.log("    │    ├─ useDisclosure()");
console.log("    │    │    ├─ useToggle()  → useState");
console.log("    │    │    └─ useState");
console.log("    │    ├─ useRef");
console.log("    │    └─ useEffect");
console.log("    └─ useState('dark')");
console.log("\n  the component's ACTUAL hook list:");
fiber.hooks.forEach((h, i) => {
  console.log(`    slot ${i}: ${h.type.padEnd(6)} owner: ${h.owner}`);
});

console.log("\n  Four levels of nesting in the CODE. One flat list at RUNTIME.");
console.log("  Every slot is owned by SettingsPage — useToggle has no hook list");
console.log("  of its own. That flattening is the entire reason hooks compose.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — LOGIC IS SHARED, STATE IS NOT
// ══════════════════════════════════════════════════════════════════
//
// The #1 misconception about custom hooks, and a very common interview probe.

console.log("§5 — two components, one hook, two states:\n");

function useCounter(start) {
  const [count, setCount] = R.useState(start);
  return { count, increment: () => setCount(c => c + 1) };
}

const fiberA = createFiber("Header");
const fiberB = createFiber("Footer");

let counterA, counterB;
R.render(fiberA, () => { counterA = useCounter(0); return null; });
R.render(fiberB, () => { counterB = useCounter(0); return null; });

counterA.increment();
counterA.increment();
counterA.increment();

// Re-render both to read the fresh values:
R.render(fiberA, () => { counterA = useCounter(0); return null; });
R.render(fiberB, () => { counterB = useCounter(0); return null; });

console.log("  <Header> and <Footer> both call useCounter(0).");
console.log("  Header increments 3 times.\n");
console.log("    Header count:", counterA.count);
console.log("    Footer count:", counterB.count, "← untouched");
console.log("\n    Header's hooks:", JSON.stringify(fiberA.hooks.map(h => h.value)));
console.log("    Footer's hooks:", JSON.stringify(fiberB.hooks.map(h => h.value)));

console.log("\n  Same hook, same initial value, two completely separate states.");
console.log("  A custom hook is a FUNCTION — calling it runs its body against");
console.log("  the CALLER's fiber. Two callers, two fibers, two hook lists.");
console.log("\n  This is exactly like calling any function twice: you get two");
console.log("  sets of local variables, not shared ones. Nothing about hooks");
console.log("  changes that.");
console.log("\n  If you WANT shared state, you need something outside React's");
console.log("  per-fiber storage: context, a store (Zustand/Redux), or lifting");
console.log("  the state to a common parent. → 04_state-patterns/\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHY HOCs AND RENDER PROPS LOST
// ══════════════════════════════════════════════════════════════════
//
// The history question that explains why hooks exist at all.
//
// THE PROBLEM (2015-2018): how do you share stateful logic between
// components? Both pre-hooks answers wrapped components.
//
//   HOCs:
//     export default withRouter(
//       withTheme(
//         connect(mapState)(
//           withWindowSize(
//             withAuth(MyComponent)
//           )
//         )
//       )
//     );
//
//   Render props:
//     <Router>{router => (
//       <Theme>{theme => (
//         <Auth>{user => (
//           <WindowSize>{size => (
//             <MyComponent ... />
//           )}</WindowSize>
//         )}</Auth>
//       )}</Theme>
//     )}</Router>
//
//   Hooks:
//     const router = useRouter();
//     const theme = useTheme();
//     const user = useAuth();
//     const size = useWindowSize();
//
// Five behaviours: five wrapper components, or four lines.
//
// The problems were not just aesthetic:
//   1. WRAPPER HELL — five extra fibers per component in the DevTools tree,
//      and in the real DOM if any wrapper rendered an element.
//   2. PROP COLLISIONS — withTheme and withAuth both inject `name`? One
//      silently wins. There is no way to rename without another HOC.
//   3. NO TYPE SAFETY — the props MyComponent receives came from four
//      wrappers. Typing that composition was miserable.
//   4. INDIRECTION — "where does this prop come from?" meant reading the
//      whole HOC chain.
//   5. THE DIAMOND — two HOCs both wanting the same underlying data each
//      subscribed separately. Two subscriptions, two re-renders.
//
// Hooks fixed all five with one property: they return VALUES, and you name
// them yourself.

console.log("§6 — the wrapper tree vs the flat call list:\n");

function countLayers(behaviours, style) {
  if (style === "hoc") {
    // Each HOC is a real component in the tree.
    return { fibers: behaviours + 1, depth: behaviours + 1 };
  }
  if (style === "render-props") {
    return { fibers: behaviours + 1, depth: behaviours + 1 };
  }
  // Hooks add ZERO fibers. They flatten into the component's own list.
  return { fibers: 1, depth: 1 };
}

console.log("  behaviours | HOC fibers | render-prop depth | hook fibers");
console.log("  -----------|------------|-------------------|------------");
for (const n of [1, 3, 5]) {
  const hoc = countLayers(n, "hoc");
  const rp = countLayers(n, "render-props");
  const hooks = countLayers(n, "hooks");
  console.log(`  ${String(n).padStart(10)} | ${String(hoc.fibers).padStart(10)} | ` +
    `${String(rp.depth).padStart(17)} | ${String(hooks.fibers).padStart(11)}`);
}

console.log("\n  Five shared behaviours = six components in the tree with HOCs,");
console.log("  or ONE with hooks. Every wrapper is a real fiber: memory, a");
console.log("  reconciliation step, and a line of noise in DevTools.");

// The prop collision, made concrete:
console.log("\n  And the collision problem:");
const withTheme = (props) => ({ ...props, name: "dark" });      // theme name
const withAuth = (props) => ({ ...props, name: "Vineet" });     // user name
const hocProps = withAuth(withTheme({}));
console.log("    withAuth(withTheme({})) →", JSON.stringify(hocProps));
console.log("    🐛 the theme's `name` is GONE. Silently. Last wrapper wins.");

const themeName = "dark";
const userName = "Vineet";
console.log("\n    const { name: themeName } = useTheme();");
console.log("    const { name: userName } = useAuth();");
console.log("    →", JSON.stringify({ themeName, userName }), "✅ you name them");
console.log("\n  THAT is the deepest fix. HOCs inject props into a namespace you");
console.log("  do not control. Hooks return values you destructure and name");
console.log("  yourself — collisions become impossible by construction.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — BUILDING useSearch FROM FOUR HOOKS
// ══════════════════════════════════════════════════════════════════

console.log("§7 — composing a real feature:\n");

// Reusing the ideas from files 02-08, composed:
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = R.useState(value);
  R.useEffect(() => { setDebounced(value); }, [value, delay]);
  return debounced;
}

function useQueryState(initial) {
  const [query, setQuery] = R.useState(initial);
  return { query, setQuery };
}

function useResults(query) {
  const [data] = R.useState(query ? [`result for "${query}"`] : []);
  return data;
}

function useSearchHistory() {
  const history = R.useRef([]);
  return { history, record: (q) => history.current.push(q) };
}

// The composed hook — four hooks, four lines, one feature:
function useSearch(initial) {
  const { query, setQuery } = useQueryState(initial);
  const debounced = useDebouncedValue(query, 300);
  const results = useResults(debounced);
  const { history, record } = useSearchHistory();
  return { query, setQuery, results, history, record };
}

const searchFiber = createFiber("SearchPage");
let search;
R.render(searchFiber, () => {
  search = useSearch("react");
  return null;
});

console.log("  function useSearch(initial) {");
console.log("    const { query, setQuery } = useQueryState(initial);");
console.log("    const debounced = useDebouncedValue(query, 300);");
console.log("    const results = useResults(debounced);");
console.log("    const { history, record } = useSearchHistory();");
console.log("    return { query, setQuery, results, history, record };");
console.log("  }\n");
console.log("    results:", JSON.stringify(search.results));
console.log("    hook slots used by SearchPage:", searchFiber.hooks.length);
console.log("    slot types:", JSON.stringify(searchFiber.hooks.map(h => h.type)));

console.log("\n  Four hooks composed into one, and the component that calls");
console.log("  useSearch() sees a single line. Each piece is independently");
console.log("  testable and independently reusable — useDebouncedValue does not");
console.log("  know search exists.");
console.log("\n  Compare the HOC version:");
console.log("    withQuery(withDebounce(withResults(withHistory(SearchPage))))");
console.log("  Four extra fibers, four chances for a prop collision, and the");
console.log("  order of the wrappers now matters for reasons nobody can see.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHEN NOT TO EXTRACT A HOOK
// ══════════════════════════════════════════════════════════════════
//
// The senior half of this topic. Extraction has costs.
//
//   ❌ DON'T extract when it is used ONCE:
//      A hook used in one place is just that component's code moved to
//      another file. You have added indirection and gained nothing. Wait for
//      the second use.
//
//   ❌ DON'T extract "for organization":
//      useUserPageLogic(props) that returns 14 values is not a hook — it is
//      the component turned inside out. Now the state is in one file and the
//      JSX in another, and you have to read both anyway.
//
//   ❌ DON'T extract effects with no reusable logic:
//      useDocumentTitle(title) hides ONE line — useEffect(() => {
//      document.title = title }, [title]) — behind a name you have to look up.
//
//   ❌ DON'T bundle unrelated concerns:
//      useAuthAndThemeAndRouter() — three concerns, one hook, no reuse.
//      Hooks group by CONCERN. That was the whole argument against lifecycle
//      methods. → 01_react-fundamentals/09_component-types-class-vs-func.js §4
//
//   ✅ DO extract when:
//      • the SAME logic appears in 2+ components
//      • it wraps an external system (a subscription, a browser API, a socket)
//      • it makes a component testable by isolating the tricky part
//      • it has a name people would use in conversation — "the debounce",
//        "the click-outside", "the interval"
//
// The test:
//   Can you name it after WHAT IT DOES, without mentioning where it is used?
//     useDebounce ✅        useSearchPageState ❌
//     useOnClickOutside ✅  useModalLogic ❌
//
//   A name that references a specific component is a smell. It means you
//   extracted a LOCATION, not a BEHAVIOUR.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL CODEBASES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Production
//   ───────────               ──────────
//   return an object          conventions matter: return a TUPLE when the
//                             caller should rename ([value, setValue] like
//                             useState), an OBJECT when there are many values
//                             and names are meaningful
//   n/a                       memoize the returned object/functions —
//                             a custom hook returning a fresh object every
//                             render breaks every caller's dep arrays, and
//                             they cannot fix it from outside
//                             → 08_usecallback-when-to-use.js §8
//   n/a                       test the hook directly with
//                             @testing-library/react's renderHook — that is
//                             the real payoff of extraction
//   n/a                       HOCs are not dead: error boundaries still need
//                             a class, and some library APIs (React.memo,
//                             forwardRef pre-19) are HOCs by nature
//
// The memoization point is the one that bites:
//   function useSearch() {
//     return { query, setQuery, results };   // ← a NEW object every render
//   }
//   Any caller doing useEffect(() => {}, [search]) now loops. The hook author
//   must be a good citizen — this is the one case where memoizing "just in
//   case" is correct, because you cannot know your caller.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Two components share the hook, so they share state":
//   They do not. Each fiber has its own list. → §5. Use context or a store.
//
// Bug 2 — Rules of Hooks violated three levels deep:
//   A conditional inside a nested custom hook shifts the CALLER's slots.
//   → 01_rules-of-hooks.js
//
// Bug 3 — Every caller's effects re-run every render:
//   The hook returns a fresh object. → §9.
//
// Bug 4 — A "hook" with 14 return values:
//   It is a component turned inside out. → §8.
//
// Bug 5 — Prop collision from HOCs:
//   Two wrappers inject `name`. One silently wins. → §6.
//
// Bug 6 — A hook that is used once:
//   Indirection with no reuse. Wait for the second caller.
//
// Bug 7 — Extracting the wrong seam:
//   useUserPageLogic — named after a place, not a behaviour. → §8.
//
// Bug 8 — Circular hook dependencies:
//   useA calls useB calls useA. Hooks are functions; this is just infinite
//   recursion, and it stack-overflows like any other.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Flattening — the headline:
assert(fiber.hooks.length === 6,
  "4 levels of nesting → 6 slots in ONE flat list");
assert(fiber.hooks.every(h => h.owner === "SettingsPage"),
  "EVERY slot is owned by the component — useToggle has no hook list of its own");
assert(fiber.hooks[0].value === "Settings" && fiber.hooks[5].value === "dark",
  "the component's own hooks bracket the nested ones");
assert(fiber.hooks[1].type === "state",
  "useToggle's useState landed at slot 1 — inside the CALLER's list");

// Logic shared, state NOT shared:
assert(counterA.count === 3, "Header incremented 3 times");
assert(counterB.count === 0, "Footer is untouched — SAME hook, DIFFERENT state");
assert(fiberA.hooks !== fiberB.hooks, "two fibers, two hook lists");
assert(fiberA.hooks[0].value !== fiberB.hooks[0].value,
  "custom hooks share the CODE, never the DATA");

// The wrapper cost:
assert(countLayers(5, "hoc").fibers === 6, "5 HOCs = 6 fibers in the tree");
assert(countLayers(5, "hooks").fibers === 1, "5 hooks = 1 fiber");
assert(countLayers(5, "hooks").fibers < countLayers(5, "hoc").fibers,
  "hooks add ZERO components — that flatness is the whole point");

// The prop collision:
assert(hocProps.name === "Vineet",
  "withAuth's `name` silently clobbered withTheme's — no way to rename");
assert(Object.keys(hocProps).length === 1,
  "two HOCs injected two values and only ONE survived 🐛");
assert(themeName !== userName,
  "with hooks you destructure and name them yourself — collision impossible ✅");

// Composition:
assert(searchFiber.hooks.length === 5,
  "useSearch composed 4 hooks into 5 flat slots");
assert(search.results.length === 1, "and the composed feature works");

console.log("§11 — mini assertions passed for: Composing custom hooks");
console.log("\n  The two that matter: every slot is owned by the COMPONENT");
console.log("  (flattening), and Header's count is 3 while Footer's is 0");
console.log("  (logic shared, state not).");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do custom hooks compose?", answer like this:
//
//   "A custom hook is just a function that calls hooks, so composing them is
//    just calling them. There's no special API. The important part is that
//    they FLATTEN: a custom hook has no fiber and no hook list of its own — it
//    borrows the caller's. So four levels of nesting in the code become one
//    linear list at runtime, all owned by the component.
//
//    That flatness is why hooks replaced HOCs and render props. Both solved
//    the same problem — sharing stateful logic — by wrapping components, so
//    five behaviours meant five wrapper components, five fibers, and five
//    levels of nesting. With hooks it's four lines and zero extra components.
//
//    The deepest fix though is naming. HOCs inject props into a namespace you
//    don't control, so if withTheme and withAuth both inject `name`, one
//    silently wins and you can't rename without another HOC. Hooks return
//    values you destructure yourself — const { name: themeName } = useTheme()
//    — so collisions are impossible by construction.
//
//    The thing people get wrong: custom hooks share LOGIC, not STATE. Two
//    components calling useCounter get two separate counts, because each has
//    its own fiber and its own hook list. It's exactly like calling any
//    function twice — two sets of locals. If you want shared state you need
//    context or a store.
//
//    And I'd push back on over-extraction. A hook used once is indirection
//    with no reuse. useUserPageLogic returning fourteen values is a component
//    turned inside out. The test I use: can you name it after what it DOES
//    without mentioning where it's used? useDebounce passes; useModalLogic
//    doesn't — that's a location, not a behaviour.
//
//    One responsibility if you write one: memoize what you return. A hook
//    returning a fresh object every render breaks every caller's dep arrays,
//    and they can't fix it from outside."
//
// The naming/collision point and "logic not state" are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How do custom hooks compose?
// A1. They are functions. Calling them runs their hooks against the caller's
//     fiber, so everything flattens into one list.
//
// Q2. Do two components using the same hook share state?
// A2. No. Each fiber has its own hook list. They share the code, not the data.
//
// Q3. Why did hooks replace HOCs?
// A3. No wrapper components, no prop collisions, better types, and less
//     indirection. Composition by calls instead of nesting.
//
// Q4. What is the prop collision problem?
// A4. HOCs inject into a namespace you do not control. Two HOCs injecting
//     `name` means one silently wins. Hooks return values you name yourself.
//
// Q5. Do the Rules of Hooks apply inside custom hooks?
// A5. Yes — they occupy the caller's slots, so a conditional three levels deep
//     still shifts the component's hook list.
//
// Q6. When should you NOT extract a hook?
// A6. Used once, "for organization", one-liners, or bundling unrelated
//     concerns. Wait for the second caller.
//
// Q7. What is your naming test?
// A7. Name it after the BEHAVIOUR, not the location. useDebounce, not
//     useSearchPageState.
//
// Q8. What is a hook author's responsibility?
// A8. Memoize the returned object and functions. Callers may put them in dep
//     arrays and cannot fix instability from outside.
//
// Q9. Are HOCs dead?
// A9. Mostly, but not entirely. Error boundaries still need a class, and some
//     APIs are HOCs by nature — React.memo, and forwardRef before React 19.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: How do custom hooks compose?
//   Back : They are functions. Calling them flattens their hooks into the
//          caller's list.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : A custom hook has NO fiber. It borrows the caller's slots.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Thinking two callers share state. They share code only.
//
// Flashcard 4:
//   Front: Why did HOCs lose?
//   Back : Wrapper hell, prop collisions, bad types, indirection.
//
// Flashcard 5:
//   Front: The naming test?
//   Back : Name the BEHAVIOUR, not the location. useDebounce, not useModalLogic.
//
// Flashcard 6:
//   Front: A hook author's duty?
//   Back : Memoize what you return — callers put it in dep arrays.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Explain the prop-collision fix, and argue against over-extraction.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Compose useSearch from the REAL hooks in files 02-08: useDebounce +
//   useFetch + useLocalStorage for history. Count the slots.
//
// Task 2:
//   Break it: put an early return inside useToggle, three levels deep. Watch
//   the COMPONENT's slots shift. That is why the rules go all the way down.
//
// Task 3:
//   Make useSearch return an unmemoized object, then have a caller put it in
//   a dep array. Watch the loop. Now fix it with useMemo.
//
// Task 4:
//   Write the same feature as an HOC chain and as hooks. Count fibers, lines,
//   and prop collisions.
//
// Task 5:
//   Take a component with 200 lines and extract hooks from it. Then ask
//   honestly: is each one reusable, or did you just move code? Delete the ones
//   that only moved code.
//
// Task 6:
//   Explain in 60 seconds why two components calling useCounter do not share
//   a count, to someone who is convinced they should.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Hooks compose by CALLS and flatten into the caller's list. HOCs composed
//   by NESTING and stacked wrappers.
//
// If you remember the common bug:
//   Custom hooks share LOGIC, never STATE. Two callers, two fibers, two
//   independent states.
//
// If you remember the professional framing:
//   Name the behaviour, not the location. Do not extract for one use.
//   Memoize what you return — your callers cannot fix it from outside.
//
// NEXT TOPIC -> index.js, then 2a.3 → 04_state-patterns/01_lifting-state-up.js
