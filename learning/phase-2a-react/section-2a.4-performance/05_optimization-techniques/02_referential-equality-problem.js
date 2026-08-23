// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  02_referential-equality-problem.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Referential equality problem
//
// WHAT YOU WILL MASTER HERE:
//   1. Why {} !== {} and why React's entire optimization layer rests on it
//   2. The FIVE places React compares references — one rule, five costumes
//   3. The infinite effect loop, reproduced and counted
//   4. useMemo / useCallback: the fix, its dependency chain, and its limits
//   5. The context-value trap that re-renders an entire app
//   6. Fixes that need no hooks at all — hoist, primitive-ize, restructure
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/02_referential-equality-problem.js"
//
// Prerequisites: 01_react-memo-when-to-use.js §5 (where this problem appeared),
// 02_built-in-hooks/07_usememo and 08_usecallback, 04_state-patterns/13
// (immutable updates — the SAME Object.is rule, seen from the other side).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The referential equality problem:
// Objects, arrays and functions created during render are NEW values every
// time — so every React comparison that uses Object.is sees "changed", even
// when nothing meaningful did.
//
// If interviewer says "explain it simply", say:
// "In JavaScript, {} === {} is false — two objects with identical contents are
//  still different values. A component body runs on every render, so any object,
//  array or arrow function written inside it is recreated every render. React
//  compares with Object.is, so it concludes the value changed, and every
//  optimization built on that comparison fails."
//
// If interviewer asks "why does it matter?", say:
// "Because it's not one bug — it's the same bug in five places. memo's prop
//  check, useMemo's deps, useCallback's deps, useEffect's deps and a context
//  value are all Object.is comparisons. One unstable object breaks all of them
//  at once, and in the useEffect case it doesn't just cost performance, it
//  creates an infinite loop. Understanding this ONE rule is what makes React
//  performance stop feeling like superstition."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   IDENTITY, not contents
//
// Runtime rule:
//   An object literal, array literal, or function expression evaluates to a NEW
//   value each time the expression runs. A component body is an expression that
//   runs on every render. Therefore: every render, new identity.
//
// Practical rule:
//   Stabilize the value where it is CREATED, not where it is compared. If ten
//   components have a broken memo, there is usually one parent recreating one
//   object.
//
// Common trap:
//   `useEffect(() => {...}, [options])` where `options = { limit: 10 }` sits in
//   the component body. The effect runs → setState → re-render → new `options`
//   → the effect runs. Forever.
//
// The one line to hold on to:
//
//   render 1:   { limit: 10 }  ──┐
//   render 2:   { limit: 10 }  ──┼── three DIFFERENT values that print identically
//   render 3:   { limit: 10 }  ──┘
//
//   console.log shows you contents. React sees identities. That mismatch is
//   why this bug is so hard to see: the debugger says nothing changed.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE JAVASCRIPT FACT UNDERNEATH
// ══════════════════════════════════════════════════════════════════

console.log("§3 — identity vs contents:\n");

console.log("    {} === {}                    ", {} === {});
console.log("    [] === []                    ", [] === []);
console.log("    (() => {}) === (() => {})    ", (() => {}) === (() => {}));
console.log("    'a' === 'a'                  ", "a" === "a", "  ← primitives compare BY VALUE");
console.log("    42 === 42                    ", 42 === 42, "  ← so numbers/strings/bools are safe props");

const a = { id: 1 };
const b = { id: 1 };
const c = a;
console.log("\n    a and b look identical:", JSON.stringify(a), JSON.stringify(b));
console.log("    Object.is(a, b)              ", Object.is(a, b), " 🐛 different objects");
console.log("    Object.is(a, c)              ", Object.is(a, c), " ✅ same object");
console.log("    JSON.stringify(a) === JSON.stringify(b)", JSON.stringify(a) === JSON.stringify(b),
  "← what your EYES do");

console.log("\n  React never does the last one. It does Object.is. That single");
console.log("  disagreement between what you see and what React checks is this");
console.log("  entire topic.\n");

// A component body, simulated. This is the whole mechanism:
function ProductList(props) {
  const config = { pageSize: 20 };                // ← new object,  every call
  const ids = [1, 2, 3];                          // ← new array,   every call
  const onSelect = () => props.select();          // ← new function, every call
  return { config, ids, onSelect };
}

const r1 = ProductList({ select() {} });
const r2 = ProductList({ select() {} });

console.log("  the same component called twice — nothing changed in the source:");
console.log("    config same?  ", Object.is(r1.config, r2.config), "🐛");
console.log("    ids same?     ", Object.is(r1.ids, r2.ids), "🐛");
console.log("    onSelect same?", Object.is(r1.onSelect, r2.onSelect), "🐛");
console.log("\n  Three fresh identities per render, forever. Now watch what each");
console.log("  one breaks.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FIVE PLACES REACT COMPARES REFERENCES
// ══════════════════════════════════════════════════════════════════
//
// Memorize this table. It is the answer to half of React's performance questions.
//
//   #  Where                     What it compares          What breaks
//   ─  ────────────────────────  ────────────────────────  ─────────────────────
//   1  React.memo                each prop, shallow        the skip never happens
//   2  useMemo deps              each dep, Object.is       recompute every render
//   3  useCallback deps          each dep, Object.is       new fn → breaks memo below
//   4  useEffect deps            each dep, Object.is       effect refires — or LOOPS
//   5  Context value             the value, Object.is      ALL consumers re-render
//
// (And a sixth, from a different angle: useSyncExternalStore's getSnapshot must
//  return a stable reference or React loops. → 02_built-in-hooks/14.)
//
// All five are the same `Object.is`. Not five rules — one rule, five costumes.

console.log("§4 — one rule, five costumes:\n");

function depsChanged(prev, next) {
  if (!prev) return true;
  return !prev.every((d, i) => Object.is(d, next[i]));
}

const options = () => ({ limit: 10 });            // recreated each render

let recomputes = 0, effectRuns = 0;
let prevMemoDeps = null, prevEffectDeps = null;

for (let render = 0; render < 5; render++) {
  const deps = [options()];                        // ← the unstable dep
  if (depsChanged(prevMemoDeps, deps)) recomputes++;
  prevMemoDeps = deps;
  if (depsChanged(prevEffectDeps, deps)) effectRuns++;
  prevEffectDeps = deps;
}

console.log("    5 renders with an unstable object in the deps array:");
console.log("      useMemo recomputed :", recomputes, "/ 5 🐛  (the memo is decoration)");
console.log("      useEffect ran      :", effectRuns, "/ 5 🐛  (a network request each time)");

let stableRecomputes = 0, prevStable = null;
const STABLE = { limit: 10 };                      // hoisted OUT of the component
for (let render = 0; render < 5; render++) {
  const deps = [STABLE];
  if (depsChanged(prevStable, deps)) stableRecomputes++;
  prevStable = deps;
}
console.log("\n    the same 5 renders with ONE stable reference:");
console.log("      useMemo recomputed :", stableRecomputes, "/ 5 ✅ (the first, as designed)");
console.log("\n  Same code, same contents, different identity. That is the whole delta.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE INFINITE LOOP (COSTUME 4 IS THE DANGEROUS ONE)
// ══════════════════════════════════════════════════════════════════

console.log("§5 — when it stops being a performance bug:\n");

// ❌ THE BUG
//
//   function Search({ term }) {
//     const params = { term, limit: 10 };            // new object every render
//     const [results, setResults] = useState([]);
//     useEffect(() => {
//       fetch(url, params).then(r => setResults(r)); // setState → re-render
//     }, [params]);                                  // → new params → effect → ...
//   }
//
// Every step is individually reasonable. Together they never stop.

let loopRenders = 0, loopEffects = 0, loopPrevDeps = null;
const MAX = 1000;                                   // a real browser has no MAX

function buggyRender() {
  loopRenders++;
  const params = { term: "react", limit: 10 };      // ← recreated
  const deps = [params];
  if (depsChanged(loopPrevDeps, deps)) {
    loopPrevDeps = deps;
    loopEffects++;
    if (loopRenders < MAX) buggyRender();            // setState → render again
  }
}
buggyRender();

console.log("    ❌ object literal in the deps array:");
console.log("       renders:", loopRenders, " effects:", loopEffects, " 🐛 stopped only by MAX");
console.log("       In a browser: the tab locks, the network tab fills with identical");
console.log("       requests, and React eventually throws 'Maximum update depth exceeded'.");

let fixedRenders = 0, fixedEffects = 0, fixedPrevDeps = null;
function fixedRender(term, limit) {                  // ← PRIMITIVE deps
  fixedRenders++;
  const deps = [term, limit];
  if (depsChanged(fixedPrevDeps, deps)) {
    fixedPrevDeps = deps;
    fixedEffects++;
    if (fixedRenders < MAX) fixedRender(term, limit);
  }
}
fixedRender("react", 10);

console.log("\n    ✅ the same effect with primitive deps [term, limit]:");
console.log("       renders:", fixedRenders, " effects:", fixedEffects, " ← it settles immediately");
console.log("\n  This is the most important fix in the file and it uses NO hooks:");
console.log("  destructure the object and depend on the PRIMITIVES inside it.");
console.log("  Primitives compare by value, so the comparison is stable by nature.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — useMemo / useCallback: THE FIX AND ITS CHAIN
// ══════════════════════════════════════════════════════════════════

console.log("§6 — stabilizing on purpose:\n");

// A working useMemo, ~10 lines. This is genuinely all it is:
function makeMemoSlot() {
  let lastDeps = null, lastValue;
  return function useMemo(factory, deps) {
    if (lastDeps && deps.every((d, i) => Object.is(d, lastDeps[i]))) return lastValue;
    lastDeps = deps;
    lastValue = factory();                          // ← runs only when deps changed
    return lastValue;
  };
}

const memoSlot = makeMemoSlot();
let factoryCalls = 0;

function renderWithMemo(term) {
  return memoSlot(() => { factoryCalls++; return { term, limit: 10 }; }, [term]);
}

const v1 = renderWithMemo("react");
const v2 = renderWithMemo("react");   // same term → same object back
const v3 = renderWithMemo("react");
const v4 = renderWithMemo("vue");     // term changed → new object

console.log("    4 renders, term changes once:");
console.log("      factory calls        :", factoryCalls, "✅ (not 4)");
console.log("      v1 === v2 === v3     :", Object.is(v1, v2) && Object.is(v2, v3), "✅ identity held");
console.log("      v3 === v4            :", Object.is(v3, v4), "← changed only when it should");

// ── THE CHAIN ─────────────────────────────────────────────────────
// useCallback is useMemo for functions:
//   useCallback(fn, deps)  ===  useMemo(() => fn, deps)
//
// And stability is a CHAIN. Every link must hold:
//
//   const filters = useMemo(() => ({ q }), [q]);        // link 1
//   const onSearch = useCallback(() => run(filters), [filters]); // link 2
//   <MemoizedResults onSearch={onSearch} filters={filters} />    // link 3
//
// Break link 1 and links 2 and 3 fail too. This is why "I added useCallback and
// it still re-renders" is so common: the callback depends on an unstable object.

console.log("\n    the chain — one broken link fails the whole thing:");
const chain = (filtersStable) => {
  let prevFilters = null, prevCb = null, cbIdentityChanges = 0;
  for (let i = 0; i < 4; i++) {
    const filters = filtersStable ? (prevFilters ?? { q: "x" }) : { q: "x" };
    const cb = Object.is(filters, prevFilters) && prevCb ? prevCb : () => filters;
    if (!Object.is(cb, prevCb)) cbIdentityChanges++;
    prevFilters = filters; prevCb = cb;
  }
  return cbIdentityChanges;
};
console.log("      filters unstable → callback identity changed", chain(false), "/ 4 times 🐛");
console.log("      filters stable   → callback identity changed", chain(true), "/ 4 times ✅");

// ⚠️ Two honest caveats to say out loud:
//   1. useMemo is a PERFORMANCE hint, not a semantic guarantee. React reserves
//      the right to discard the cache (it does, for offscreen content). Never
//      write code whose CORRECTNESS depends on useMemo not recomputing.
//   2. useMemo is not free either. It costs an array allocation, a comparison
//      loop and permanent memory per hook. `useMemo(() => a + b, [a, b])` is
//      slower than `a + b`. Memoize objects passed to memoized children and
//      genuinely expensive computations. Not arithmetic.
console.log("\n    ⚠️ useMemo is a HINT. React may discard the cache. Never depend on");
console.log("       it for correctness — only for speed.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE CONTEXT-VALUE TRAP (COSTUME 5, THE WIDEST BLAST RADIUS)
// ══════════════════════════════════════════════════════════════════

console.log("§7 — one inline object, every consumer:\n");

// ❌  <AuthContext.Provider value={{ user, login, logout }}>
//     A new object on every provider render → every consumer re-renders, even
//     ones that only read `logout`, which never changes.

function runProvider({ stable, consumers, renders }) {
  let rerenders = 0, prevValue = null;
  let memoized = null, memoDeps = null;
  for (let r = 0; r < renders; r++) {
    const user = { name: "Vineet" };               // same content each render
    let value;
    if (stable) {
      const deps = ["Vineet"];                     // depends on a PRIMITIVE
      if (!memoDeps || !memoDeps.every((d, i) => Object.is(d, deps[i]))) {
        memoDeps = deps;
        memoized = { user, login() {}, logout() {} };
      }
      value = memoized;
    } else {
      value = { user, login() {}, logout() {} };   // inline
    }
    if (!Object.is(value, prevValue)) rerenders += consumers;
    prevValue = value;
  }
  return rerenders;
}

const unstable = runProvider({ stable: false, consumers: 21, renders: 5 });
const stable = runProvider({ stable: true, consumers: 21, renders: 5 });

console.log("    an app with 21 consumers, provider renders 5×:");
console.log("      value={{ ... }} inline :", unstable, "consumer re-renders 🐛");
console.log("      value={memoizedValue}  :", stable, "consumer re-renders ✅");
console.log("      saved                  :", unstable - stable);

console.log("\n  And note memo cannot save you here — §6 of file 01: context bypasses");
console.log("  the prop comparison entirely. The provider's value IS the subscription.");
console.log("  The two real fixes:");
console.log("    1. useMemo the value (and useCallback the functions inside it).");
console.log("    2. SPLIT the context. Put the rarely-changing functions in one");
console.log("       provider and the frequently-changing data in another. Then a");
console.log("       consumer of only the functions never re-renders at all.");
console.log("  Fix 2 is structural and strictly better. → 04_state-patterns/03 §6\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — FIXES THAT NEED NO HOOKS
// ══════════════════════════════════════════════════════════════════
//
// Reach for these BEFORE useMemo. They cost nothing and cannot go stale.
//
//   1. HOIST IT OUT.
//      const EMPTY = [];                        // module scope — one identity, forever
//      const CHART_OPTIONS = { responsive: true };
//      function Chart() { return <C options={CHART_OPTIONS} data={data ?? EMPTY} /> }
//      ↑ The `?? []` version creates a new empty array every render and breaks
//        every memo below it. A shared EMPTY constant is a real, common fix.
//
//   2. PASS PRIMITIVES.
//      ❌ <Row user={{ id, name }} />        →  ✅ <Row id={id} name={name} />
//      Primitives compare by value. Nothing to stabilize.
//
//   3. DEPEND ON PRIMITIVES.
//      ❌ }, [options])                      →  ✅ }, [options.limit, options.sort])
//      This is §5's fix and it kills the infinite loop outright.
//
//   4. MOVE IT INSIDE THE EFFECT.
//      An object only the effect uses does not belong in the render body at all.
//      useEffect(() => { const params = { limit: 10 }; ... }, [term])
//      Now it cannot be a dependency, because it does not exist outside.
//
//   5. useRef FOR "I NEED IT, BUT NOT AS A DEPENDENCY".
//      A ref's .current changes without changing the ref's identity. That is
//      exactly what a mutable-but-not-reactive value is.
//
//   6. RESTRUCTURE. → 01 §9. Move state down; pass children.

console.log("§8 — the no-hook fixes, measured:\n");

let breaks = 0, prevProp = null;
for (let i = 0; i < 5; i++) {
  const data = null;
  const list = data ?? [];                          // ❌ new [] every render
  if (!Object.is(list, prevProp)) breaks++;
  prevProp = list;
}

const EMPTY = [];                                   // ✅ hoisted, module scope
let holds = 0, prevHoisted = null;
for (let i = 0; i < 5; i++) {
  const data = null;
  const list = data ?? EMPTY;
  if (!Object.is(list, prevHoisted)) holds++;
  prevHoisted = list;
}

console.log("    `data ?? []`     → prop identity changed", breaks, "/ 5 🐛");
console.log("    `data ?? EMPTY`  → prop identity changed", holds, "/ 5 ✅");
console.log("\n  Two characters of difference. This exact line — a `?? []` default —");
console.log("  is one of the most common silent memo-killers in real code, because");
console.log("  it looks like a null check, not like an allocation.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN NOT TO CARE
// ══════════════════════════════════════════════════════════════════
//
// Say this part unprompted. It is what separates "knows the rule" from
// "knows when the rule matters".
//
//   • If the child is NOT memoized, a new object prop costs nothing extra. The
//     child was re-rendering anyway. Wrapping every prop in useMemo "to be safe"
//     when nothing downstream compares them is pure cost.
//   • Allocating an object is nanoseconds. The problem is never the allocation
//     — it is the COMPARISON it defeats.
//   • Deps arrays are the exception: there, an unstable reference is a
//     CORRECTNESS bug (a loop, or a duplicated request), not a slow render.
//     Fix those regardless of profiling.
//   • React 19's Compiler auto-memoizes and removes most of the manual work.
//     It does not remove the need to understand this, because you still read
//     legacy code and still debug loops.
//
// The ranking to state:
//   1. Unstable deps causing effect loops or repeated fetches → always fix.
//   2. Unstable context values → almost always fix (huge blast radius).
//   3. Unstable props into memoized children → fix when profiled.
//   4. Everything else → leave it alone.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Maximum update depth exceeded":
//   An object/array/function in a deps array. → §5. The classic.
//
// Bug 2 — The same request fires on every render:
//   Same cause, milder symptom, because the effect doesn't setState. Shows up
//   as a network tab full of identical calls.
//
// Bug 3 — "I added memo and nothing changed":
//   An inline prop from the parent. → §4, 01 §6.
//
// Bug 4 — "I added useCallback and it STILL re-renders":
//   The callback's own dependency is unstable. The chain. → §6.
//
// Bug 5 — One state change re-renders the entire app:
//   An inline context value. → §7.
//
// Bug 6 — `data ?? []` silently defeats a memoized list:
//   → §8.
//
// Bug 7 — A custom hook returning `{ data, refetch }` inline:
//   Every consumer's deps break, every time. Custom hooks must return stable
//   references — useMemo the returned object. This one is invisible from the
//   call site, which makes it the meanest.
//
// Bug 8 — A style prop from a design-system wrapper:
//   The wrapper recreates it; the memo three levels down never fires. Fix at
//   the source, not at the comparison.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The JS fact:
assert(({}) !== ({}), "two object literals are never equal");
assert(Object.is(a, b) === false, "identical contents, different identity 🐛");
assert(Object.is(a, c) === true, "same reference → equal ✅");
assert(JSON.stringify(a) === JSON.stringify(b),
  "...and stringify says they're the same, which is why your eyes miss this");

// A component body recreates everything:
assert(!Object.is(r1.config, r2.config), "object literal → new identity per render");
assert(!Object.is(r1.ids, r2.ids), "array literal → new identity per render");
assert(!Object.is(r1.onSelect, r2.onSelect), "arrow function → new identity per render");

// The five costumes:
assert(recomputes === 5 && effectRuns === 5,
  "an unstable dep makes useMemo and useEffect run every render 🐛");
assert(stableRecomputes === 1, "a stable reference → they run once ✅");

// The loop:
assert(loopRenders === MAX && loopEffects === MAX,
  "object in deps → the effect re-triggers itself forever 🐛");
assert(fixedRenders === 2 && fixedEffects === 1,
  "primitive deps → the effect runs once and settles ✅");

// The fix:
assert(factoryCalls === 2, "useMemo ran the factory twice in 4 renders — deps changed once");
assert(Object.is(v1, v2) && Object.is(v2, v3), "identity held across renders ✅");
assert(!Object.is(v3, v4), "...and changed exactly when the dep changed");
assert(chain(false) === 4 && chain(true) === 1,
  "stability is a CHAIN — an unstable dep makes useCallback pointless 🐛");

// Context:
assert(unstable === 105 && stable === 21,
  "inline context value: 21 consumers × 5 renders = 105 re-renders, vs 21 🐛");

// The no-hook fix:
assert(breaks === 5 && holds === 1,
  "`data ?? []` breaks identity every render; a hoisted EMPTY holds it ✅");

console.log("§11 — mini assertions passed for: Referential equality problem");
console.log("\n  The pair that captures it: the SAME unstable object produced an");
console.log("  infinite loop in a deps array (1000 effects) and 84 wasted renders");
console.log("  through a context value. One rule. Two very different disasters.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the referential equality problem in React?", answer:
//
//   "In JavaScript, {} === {} is false — two objects with the same contents are
//    still different values. A component body re-runs on every render, so every
//    object, array and arrow function written inside it gets a new identity each
//    time. React compares with Object.is, so it sees 'changed' even though
//    nothing meaningful did.
//
//    What makes it worth understanding is that it's one rule wearing five
//    costumes: memo's prop check, useMemo's deps, useCallback's deps,
//    useEffect's deps, and a context value. One unstable object can break all
//    five at once.
//
//    Four of those cost performance. The useEffect one costs correctness — the
//    effect runs, sets state, re-renders, recreates the object, and runs again.
//    That's 'Maximum update depth exceeded', or in the milder version, the same
//    fetch firing on every render. I fix that class of bug regardless of
//    profiling.
//
//    The fixes, in the order I actually reach for them: hoist the constant out
//    of the component so it has one identity forever — including replacing
//    `data ?? []` with a shared EMPTY constant, which is a surprisingly common
//    silent memo-killer. Pass primitives instead of objects, since primitives
//    compare by value. Depend on the primitives inside the object rather than
//    the object. Move the object inside the effect so it can't be a dependency
//    at all. And only then useMemo and useCallback.
//
//    Two things I'd add. First, stability is a chain — people add useCallback,
//    it still re-renders, and the reason is that the callback's own dependency
//    is unstable. You have to fix the first broken link. Second, useMemo is a
//    performance hint, not a semantic guarantee — React can discard the cache,
//    so nothing's correctness should depend on it.
//
//    And the case where I don't care: if the child isn't memoized, an inline
//    object costs nothing, because it was re-rendering anyway. The allocation
//    was never the problem — the defeated comparison is."
//
// The five-costumes framing, the correctness-vs-performance split, and the
// "chain" are the senior parts.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why is {} !== {}?
// A1. Objects are compared by reference. Two literals are two allocations.
//
// Q2. Where does React use Object.is?
// A2. memo's prop comparison, all deps arrays (useMemo/useCallback/useEffect/
//     useLayoutEffect), context value changes, and state bailout in useState.
//
// Q3. What causes "Maximum update depth exceeded"?
// A3. An effect that sets state, with a dep that is recreated each render.
//
// Q4. useMemo vs useCallback?
// A4. useCallback(fn, d) is useMemo(() => fn, d). One memoizes a returned value,
//     the other memoizes the function itself.
//
// Q5. Is useMemo guaranteed to cache?
// A5. No. It's a hint. React may throw the cache away. Never rely on it for
//     correctness.
//
// Q6. Why does my context re-render everything?
// A6. An inline `value={{...}}` object. Memo can't help — context bypasses
//     props. useMemo it, or split the context.
//
// Q7. How do you fix an unstable dep without any hook?
// A7. Depend on primitives, hoist the constant, or move the object inside the
//     effect.
//
// Q8. Is it bad to create objects during render?
// A8. No — allocation is cheap. It's only a problem when something downstream
//     COMPARES the reference.
//
// Q9. What is the sneakiest version of this bug?
// A9. A custom hook returning a fresh `{ data, refetch }` object. Every
//     consumer's deps break and the call site shows nothing.
//
// Q10. Does the React Compiler make this obsolete?
// A10. It automates most of the fixes. It doesn't remove the concept — you
//      still debug loops and still read uncompiled code.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why does a memo'd child re-render with the same data?
//   Back : The parent created a new object/function. Identity, not contents.
//
// Flashcard 2:
//   Front: The five places React compares references?
//   Back : memo props, useMemo deps, useCallback deps, useEffect deps,
//          context value.
//
// Flashcard 3:
//   Front: Which one is a CORRECTNESS bug?
//   Back : useEffect deps — it loops. The rest just waste renders.
//
// Flashcard 4:
//   Front: Fix an unstable dep with no hooks?
//   Back : Depend on the primitives inside it. Or hoist it. Or move it into
//          the effect.
//
// Flashcard 5:
//   Front: Why is `data ?? []` dangerous?
//   Back : A new empty array every render. It defeats every memo below it.
//
// Flashcard 6:
//   Front: Is useMemo a guarantee?
//   Back : No. A hint. React may discard the cache.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "It's one Object.is rule in five costumes — and only the deps one
//          is a correctness bug." Plus: stability is a chain.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the five-costumes table from memory.
//
// Task 2:
//   Reproduce §5's infinite loop in a real app. Watch the network tab. Then fix
//   it three different ways: primitives, useMemo, moving it into the effect.
//
// Task 3:
//   Build the chain from §6 — useMemo → useCallback → memo'd child — then break
//   link 1 and confirm links 2 and 3 both fail.
//
// Task 4:
//   Put an inline value on a context provider with 20 consumers. Count renders.
//   Fix it by SPLITTING the context, not by memoizing, and count again.
//
// Task 5:
//   Find a `?? []` or `?? {}` in a real codebase. Trace whether anything below
//   it is memoized. Fix it with a hoisted constant.
//
// Task 6:
//   Write a custom hook that returns `{ data, refetch }` and prove to yourself
//   that every consumer's deps break. Then fix it inside the hook.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   React compares IDENTITY, not contents — and a component body creates fresh
//   identities on every render.
//
// If you remember the common bug:
//   An object in a deps array is an infinite loop, not a slow render.
//
// If you remember the professional framing:
//   One Object.is rule wearing five costumes. Stabilize at the SOURCE, prefer
//   fixes that need no hooks, and remember that an unmemoized child makes the
//   whole question moot.
//
// NEXT TOPIC -> 03_avoiding-unnecessary-re-renders.js
