// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  04_usecontext-use-case.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useContext — use case
//
// WHAT YOU WILL MASTER HERE:
//   1. How context lookup actually works — walking UP the tree
//   2. The re-render problem: EVERY consumer re-renders, memo cannot stop it
//   3. The value={{ }} bug that re-renders your whole app — PROVEN
//   4. Splitting contexts — the fix, measured
//   5. Why context is NOT a state manager
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/04_usecontext-use-case.js"
//
// Deep dive on the pattern: 04_state-patterns/03_context-api-provider-pattern.js
// This file is the HOOK mechanics — how lookup and re-rendering work.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useContext:
// Reads the value of the nearest matching Provider ABOVE this component in
// the tree, and subscribes the component to re-render whenever that value
// changes.
//
// If interviewer says "explain it simply", say:
// "It is a way to read a value from an ancestor without passing it through
//  every component in between. React walks up the tree to find the nearest
//  Provider for that context object."
//
// If interviewer asks "why does it matter?", say:
// "Because the subscription is all-or-nothing. Every consumer re-renders
//  when the value changes — even a consumer that only reads one field of an
//  object. There is no selector. That is why context is a dependency
//  injection tool, not a state manager."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   dependency injection, not state management
//
// The lookup — literally walking up fiber.return:
//
//   <ThemeContext.Provider value="dark">      ← found! stop here
//     <Layout>
//       <Sidebar>
//         <Button>  useContext(ThemeContext)  ← start here, walk UP
//
// Runtime rule:
//   The NEAREST provider wins. No provider anywhere? You get the
//   createContext(defaultValue) default — which is why a missing Provider
//   fails silently instead of crashing.
//
// The re-render rule — the whole reason this hook is interesting:
//   When a Provider's value changes (by Object.is), EVERY component calling
//   useContext on that context re-renders. React.memo does NOT stop it —
//   memo compares PROPS, and context is not a prop.
//
// Practical rule:
//   Context is for things that are (a) needed by many components at many
//   depths and (b) change rarely. Theme, locale, the current user, an auth
//   client. NOT for a value that changes on every keystroke.
//
// Common trap:
//   <Provider value={{ user, setUser }}> — an object literal in JSX is a NEW
//   object every render, so every consumer re-renders every time the
//   PROVIDER's parent renders, even if user never changed.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD CONTEXT
// ══════════════════════════════════════════════════════════════════

function createContext(defaultValue) {
  const context = {
    _currentValue: defaultValue,
    _defaultValue: defaultValue,
    _consumers: new Set(),
  };
  context.Provider = { $$context: context };
  return context;
}

// A fiber tree we can walk, with providers on it:
function createFiber(name, { provides, consumes, memo = false } = {}) {
  return { name, provides, consumes, memo, return: null, children: [], renders: 0 };
}

function tree(fiber, ...children) {
  for (const child of children) {
    child.return = fiber;
    fiber.children.push(child);
  }
  return fiber;
}

// THE LOOKUP — this is all useContext does:
function readContext(fiber, context) {
  let node = fiber.return;                  // start at the PARENT
  while (node) {
    if (node.provides && node.provides.context === context) {
      return node.provides.value;           // nearest provider wins
    }
    node = node.return;                     // keep climbing
  }
  return context._defaultValue;             // no provider found → the default
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LOOKUP: NEAREST PROVIDER WINS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — walking up the tree:\n");

const ThemeContext = createContext("light");     // ← the default

const deepButton = createFiber("Button", { consumes: ThemeContext });
const sidebar = tree(createFiber("Sidebar"), deepButton);
const layout = tree(createFiber("Layout"), sidebar);
const darkProvider = tree(
  createFiber("ThemeProvider", { provides: { context: ThemeContext, value: "dark" } }),
  layout
);
const app = tree(createFiber("App"), darkProvider);

console.log("  App > ThemeProvider(dark) > Layout > Sidebar > Button");
console.log("  Button reads:", JSON.stringify(readContext(deepButton, ThemeContext)));
console.log("  → walked up 3 levels to find the Provider. Layout and Sidebar");
console.log("    never knew this value existed. That is the point.\n");

// Nesting — the nearest one wins:
const innerButton = createFiber("InnerButton", { consumes: ThemeContext });
const innerProvider = tree(
  createFiber("InnerProvider", { provides: { context: ThemeContext, value: "high-contrast" } }),
  innerButton
);
darkProvider.children.push(innerProvider);
innerProvider.return = darkProvider;

console.log("  Nested: ThemeProvider(dark) > InnerProvider(high-contrast) > InnerButton");
console.log("  InnerButton reads:", JSON.stringify(readContext(innerButton, ThemeContext)));
console.log("  → the NEAREST provider wins. This is how a dark modal inside a");
console.log("    light page works.\n");

// No provider at all — the silent failure:
const orphan = createFiber("Orphan", { consumes: ThemeContext });
const standalone = tree(createFiber("SomeApp"), orphan);
void standalone;

console.log("  Orphan (no Provider anywhere) reads:",
  JSON.stringify(readContext(orphan, ThemeContext)));
console.log("  → the createContext default. NO ERROR. NO WARNING.");
console.log("    This is the silent-failure trap: you forget the Provider and");
console.log("    the app 'works' with default values until something is subtly");
console.log("    wrong. → §8 for the guard that fixes it.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE RE-RENDER PROBLEM
// ══════════════════════════════════════════════════════════════════
//
// This is the interview question. memo does NOT save you.

console.log("§5 — every consumer re-renders. memo cannot stop it:\n");

function renderTree(root, context, changedValue) {
  const rendered = [];

  function walk(fiber, parentRendered) {
    let willRender = parentRendered;

    // A memoized component with unchanged props normally skips...
    if (fiber.memo && !willRender) {
      willRender = false;
    }

    // ...BUT if it consumes the changed context, it renders anyway.
    if (fiber.consumes === context && changedValue) {
      willRender = true;                       // ← memo is bypassed entirely
    }

    if (willRender) {
      fiber.renders++;
      rendered.push(fiber.name + (fiber.memo ? " (memo!)" : ""));
    }

    for (const child of fiber.children) {
      walk(child, willRender && !child.memo);
    }
  }

  walk(root, false);
  return rendered;
}

const memoSidebar = createFiber("MemoSidebar", { memo: true });
const memoButton = createFiber("MemoButton", { consumes: ThemeContext, memo: true });
const plainDiv = createFiber("PlainDiv");
const nonConsumer = createFiber("NonConsumer", { memo: true });

const perfTree = tree(
  createFiber("Provider", { provides: { context: ThemeContext, value: "dark" } }),
  tree(memoSidebar, tree(plainDiv, memoButton)),
  nonConsumer
);

const rerendered = renderTree(perfTree, ThemeContext, true);

console.log("  Provider > MemoSidebar > PlainDiv > MemoButton (consumes theme)");
console.log("           > NonConsumer (memo, does not consume)\n");
console.log("  theme changes 'dark' → 'light'. Who re-renders?");
console.log("   ", JSON.stringify(rerendered));
console.log("\n  MemoButton re-rendered DESPITE React.memo, because it consumes");
console.log("  the context. memo compares PROPS — context is not a prop, it is");
console.log("  a separate subscription. There is no way to memo out of it.");
console.log("\n  NonConsumer did NOT re-render — memo still works for it. So");
console.log("  memo below a Provider is not useless; it just cannot protect");
console.log("  the consumers themselves.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE value={{ }} BUG
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the object literal that re-renders your whole app:\n");

function providerValueChanged(prevValue, nextValue) {
  return !Object.is(prevValue, nextValue);   // ← React's actual check
}

// ❌ BROKEN — a new object every render of the Provider's parent
function BrokenProvider(user, setUser) {
  return { user, setUser };                  // new object literal EVERY time
}

const broken1 = BrokenProvider("vineet", () => {});
const broken2 = BrokenProvider("vineet", () => {});    // user did NOT change

console.log("  <AuthContext.Provider value={{ user, setUser }}>");
console.log("    render 1 value:", JSON.stringify(broken1));
console.log("    render 2 value:", JSON.stringify(broken2), "← same DATA");
console.log("    Object.is(v1, v2):", Object.is(broken1, broken2));
console.log("    → context changed?", providerValueChanged(broken1, broken2),
  "🐛 EVERY consumer re-renders");
console.log("\n  Nothing changed. `user` is the same string. But the OBJECT is");
console.log("  new, React compares with Object.is, and every consumer in the");
console.log("  app re-renders — on every render of the Provider's parent.");
console.log("  Put this at the root of your app and unrelated state anywhere");
console.log("  above it re-renders every screen.\n");

// ✅ FIXED — useMemo, so the identity is stable when the data is
function memoizedValue(user, setUser, cache) {
  if (cache.user === user) return cache.value;         // useMemo([user])
  cache.user = user;
  cache.value = { user, setUser };
  return cache.value;
}

const cache = {};
const fixed1 = memoizedValue("vineet", () => {}, cache);
const fixed2 = memoizedValue("vineet", () => {}, cache);   // same user

console.log("  const value = useMemo(() => ({ user, setUser }), [user]);");
console.log("    Object.is(v1, v2):", Object.is(fixed1, fixed2));
console.log("    → context changed?", providerValueChanged(fixed1, fixed2),
  "✅ consumers skip");

const fixed3 = memoizedValue("ankit", () => {}, cache);    // user DID change
console.log("\n  now user actually changes to 'ankit':");
console.log("    → context changed?", providerValueChanged(fixed2, fixed3),
  "✅ consumers re-render, correctly\n");

console.log("  Note: a primitive value never has this problem.");
console.log("  <ThemeContext.Provider value={theme}> where theme is a string");
console.log("  compares by VALUE. The bug only exists for objects.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — SPLITTING CONTEXTS: THE REAL FIX
// ══════════════════════════════════════════════════════════════════
//
// useMemo fixes the accidental re-render. It does NOT fix the structural
// one: if user changes, everything reading { user, setUser } re-renders —
// including components that only ever call setUser and do not care about
// the user at all.
//
// The classic example: a huge form where thousands of components need
// dispatch, but only a few need the state.

console.log("§7 — split the context, measure the difference:\n");

const CombinedContext = createContext(null);
const StateContext = createContext(null);
const DispatchContext = createContext(null);

function countConsumerRenders(context, consumers) {
  return consumers.filter(c => c.consumes === context).length;
}

// 1 component reads state; 20 only dispatch. Very typical.
const combinedConsumers = [
  createFiber("Display", { consumes: CombinedContext }),
  ...Array.from({ length: 20 }, (_, i) =>
    createFiber("Button" + i, { consumes: CombinedContext })),
];

const splitConsumers = [
  createFiber("Display", { consumes: StateContext }),
  ...Array.from({ length: 20 }, (_, i) =>
    createFiber("Button" + i, { consumes: DispatchContext })),
];

console.log("  A form: 1 Display reads state, 20 Buttons only dispatch.");
console.log("  The state changes (a keystroke).\n");
console.log("    combined <Provider value={{state, dispatch}}> →",
  countConsumerRenders(CombinedContext, combinedConsumers), "re-render");
console.log("    split    <State.Provider> + <Dispatch.Provider> →",
  countConsumerRenders(StateContext, splitConsumers), "re-renders");

console.log("\n  The 20 buttons do not care about the state — they only need");
console.log("  dispatch, which is STABLE (useState's setter and useReducer's");
console.log("  dispatch never change identity). So they never re-render again");
console.log("  after mount. This is the standard pattern for large context");
console.log("  state, and it is what Redux gives you for free via selectors.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE PROVIDER GUARD (every codebase should have this)
// ══════════════════════════════════════════════════════════════════
//
// §4 showed the silent-default failure. The fix is a custom hook:
//
//   const AuthContext = createContext(undefined);   // ← undefined, not {}
//
//   export function useAuth() {
//     const context = useContext(AuthContext);
//     if (context === undefined) {
//       throw new Error("useAuth must be used within an <AuthProvider>");
//     }
//     return context;
//   }
//
// Two wins:
//   1. A missing Provider becomes a loud, immediate, obvious error instead of
//      "why is the user null?"
//   2. Consumers import useAuth, not AuthContext. You can now change the
//      implementation — swap to Zustand, add a selector, split the context —
//      without touching a single consumer.
//
// Never export the raw context. Export the hook.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   walk fiber.return on read the value is pushed/popped on a STACK as React
//                             renders down, so a read is O(1), not O(depth)
//   a _consumers Set          each consuming fiber records a dependency; the
//                             Provider schedules re-renders on the ones that
//                             actually read it
//   re-render everything      React propagates through the tree and can bail
//                             out on subtrees with no consumers — but never
//                             on a consumer itself
//   n/a                       React 19: <Context> is a valid Provider —
//                             <Context.Provider> is no longer required
//   n/a                       use(Context) in React 19 can be called
//                             CONDITIONALLY, unlike useContext
//
// The precise fact people get wrong:
//   Context does not "broadcast" only to consumers by magic. React walks the
//   tree from the Provider and marks consumers. A memoized subtree with NO
//   consumers inside can be skipped — which is why the old
//   "pass children through" trick helps. But any consumer WILL render.


// ══════════════════════════════════════════════════════════════════
// § 10 — WHEN NOT TO USE CONTEXT
// ══════════════════════════════════════════════════════════════════
//
// The senior answer to "how would you manage state?" is rarely "context".
//
//   ✅ GOOD for context:
//     • theme, locale, direction (rtl/ltr)
//     • the current user / auth object
//     • a router instance, a query client, a DI container for services
//     • anything that changes rarely and is needed at many depths
//
//   ❌ BAD for context:
//     • form state (changes per keystroke, re-renders every consumer)
//     • server data (use React Query — caching, dedup, invalidation)
//     • anything needing selectors ("re-render only if user.name changed")
//     • high-frequency values (mouse position, scroll, animation)
//
//   ⚠️  And the honest one: for prop drilling only 2-3 levels deep, just
//       pass the prop. Context is not free — it hides the data flow, makes
//       components untestable in isolation, and couples them to a Provider.
//       Reach for it when drilling is genuinely painful, not on principle.
//
// The composition alternative people forget:
//
//   ❌ <Layout><Sidebar user={user} /></Layout>       — drilling
//   ✅ <Layout sidebar={<Sidebar user={user} />} />   — pass the ELEMENT
//
//   Passing elements as props kills a huge share of prop drilling with no
//   context at all. → 04_state-patterns/02_prop-drilling-problem.js


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The whole app re-renders on every keystroke:
//   value={{ ... }} object literal. → §6.
//
// Bug 2 — memo does nothing:
//   The component consumes context. memo compares props. → §5.
//
// Bug 3 — "Cannot read property 'name' of null":
//   The Provider is missing and you got the default. → §8's guard.
//
// Bug 4 — Silent wrong behavior with no error:
//   Same cause, but the default was a plausible value like "light".
//
// Bug 5 — A consumer sees a stale value:
//   Two React copies in node_modules → two different context OBJECTS →
//   the lookup never matches your Provider. Classic monorepo pain.
//
// Bug 6 — Everything re-renders when only dispatch was needed:
//   One combined context. → §7, split it.
//
// Bug 7 — Context used for server data, and now you are hand-writing cache
//   invalidation. That is React Query's job.
//
// Bug 8 — Testing a component requires wrapping it in six Providers.
//   A design smell: too much context, too little composition.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The lookup:
assert(readContext(deepButton, ThemeContext) === "dark",
  "the lookup walks up past Layout and Sidebar to the Provider");
assert(readContext(innerButton, ThemeContext) === "high-contrast",
  "the NEAREST provider wins");
assert(readContext(orphan, ThemeContext) === "light",
  "no Provider → the createContext default. No error. THIS is the silent trap");

// memo cannot save a consumer:
assert(rerendered.includes("MemoButton (memo!)"),
  "a memoized CONSUMER re-renders anyway — memo compares props, not context");
assert(!rerendered.includes("NonConsumer (memo!)"),
  "...but memo still protects a non-consumer");

// The object literal bug:
assert(Object.is(broken1, broken2) === false,
  "two identical-looking value objects are different references");
assert(providerValueChanged(broken1, broken2) === true,
  "so React sees a change and re-renders EVERY consumer — for nothing");
assert(broken1.user === broken2.user,
  "...even though the actual data is identical");

// The useMemo fix:
assert(providerValueChanged(fixed1, fixed2) === false,
  "useMemo keeps the identity stable → consumers skip");
assert(providerValueChanged(fixed2, fixed3) === true,
  "and it still updates when the data genuinely changes");

// Splitting:
assert(countConsumerRenders(CombinedContext, combinedConsumers) === 21,
  "combined context: all 21 components re-render on a state change");
assert(countConsumerRenders(StateContext, splitConsumers) === 1,
  "split context: only the 1 component that reads state re-renders");

console.log("§12 — mini assertions passed for: useContext");
console.log("\n  21 vs 1. That is the entire argument for splitting contexts.");


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useContext for?", answer like this:
//
//   "It reads a value from the nearest matching Provider above the component.
//    React walks up the fiber tree — well, conceptually; it actually pushes
//    the value on a stack while rendering down, so reads are O(1). If there's
//    no Provider you silently get the createContext default, which is why I
//    always wrap it in a custom hook that throws when the value is undefined.
//    That turns a mysterious null into an immediate, obvious error.
//
//    The thing to understand is the re-render model. When the Provider's value
//    changes by Object.is, EVERY consumer re-renders. React.memo cannot stop
//    it, because memo compares props and context is a separate subscription.
//    There's no selector — you can't say 'only re-render if user.name changed'.
//
//    So the classic bug is value={{ user, setUser }}. That object literal is a
//    new reference every render, so every consumer in the app re-renders every
//    time the Provider's parent renders, even though nothing changed. useMemo
//    fixes the accidental case. But the structural fix is splitting state and
//    dispatch into two contexts — in a form with one display and twenty
//    buttons, combined re-renders 21 components per keystroke and split
//    re-renders 1, because dispatch identity is stable.
//
//    Which is why I'd say context is dependency injection, not state
//    management. Theme, locale, current user, a query client — things that
//    change rarely and are needed at many depths. For server data I'd reach
//    for React Query, and for anything needing selectors, a real store. And
//    for two or three levels of drilling I'd just pass the prop, or pass the
//    element itself as a prop — composition kills a lot of drilling with no
//    context at all."
//
// The 21-vs-1 number and "DI, not state management" are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does useContext find the value?
// A1. The nearest Provider above it. React pushes values on a stack while
//     rendering down, so the read is O(1), not a walk.
//
// Q2. What happens with no Provider?
// A2. You get the createContext default — silently. Guard with a custom hook
//     that throws on undefined.
//
// Q3. Does React.memo prevent a context re-render?
// A3. No. memo compares props; context is a separate subscription. A consumer
//     always re-renders when the value changes.
//
// Q4. Why does value={{}} re-render everything?
// A4. A new object reference every render, and React compares with Object.is.
//     The data is identical; the identity is not.
//
// Q5. Is useMemo enough?
// A5. It fixes accidental re-renders. It does not fix consumers that only
//     need part of the value — for that, split the context.
//
// Q6. Why split state and dispatch?
// A6. dispatch/setState identity is stable, so dispatch-only consumers never
//     re-render. Only the components reading state pay for a change.
//
// Q7. Is context a Redux replacement?
// A7. No. No selectors, no middleware, no devtools, no time travel. Redux
//     subscribes to a store and re-renders only what selected data changed.
//     Context re-renders every consumer.
//
// Q8. Can useContext be called conditionally?
// A8. No — it is a hook, matched by call order. React 19's use() CAN be,
//     which is one of its genuine differences.
//
// Q9. Why does my context read the default despite a Provider?
// A9. Two copies of React or of the module → two distinct context objects.
//     The identity check fails. Check node_modules / your bundler aliases.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useContext?
//   Back : Read the nearest Provider's value + subscribe to its changes.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Value changes by Object.is → EVERY consumer re-renders. No selectors.
//
// Flashcard 3:
//   Front: Does memo protect a consumer?
//   Back : No. memo compares props; context is a separate subscription.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : value={{...}} — a new object every render → everything re-renders.
//
// Flashcard 5:
//   Front: What is the structural fix?
//   Back : Split state and dispatch into two contexts. 21 renders → 1.
//
// Flashcard 6:
//   Front: What is context FOR?
//   Back : Dependency injection — theme, locale, user. Not state management.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Guard with a throwing custom hook, and never export the raw context.


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild readContext from memory. Three lines: start at fiber.return,
//   climb, return the default if you fall off the top.
//
// Task 2:
//   Implement the §8 guard in the mini version: make readContext throw when
//   the default is undefined and no Provider was found.
//
// Task 3:
//   Add a selector to the mini context: useContextSelector(ctx, s => s.user).
//   Try to make consumers skip when their slice did not change. You will
//   discover why this needs useSyncExternalStore. → file 14.
//
// Task 4:
//   Measure §7 with 1000 buttons. Combined vs split. Then decide whether
//   you would still reach for context at that scale.
//
// Task 5:
//   Break §6's fix: change the useMemo deps to []. Now setUser is captured
//   from render #1 forever. Explain what breaks and why.
//
// Task 6:
//   Explain in 60 seconds why React.memo cannot stop a context re-render,
//   to someone who just tried it and is confused.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Every consumer re-renders when the value changes. No selectors. memo
//   cannot help.
//
// If you remember the common bug:
//   value={{ user, setUser }} — a new object every render re-renders your
//   entire app for nothing.
//
// If you remember the professional framing:
//   Context is dependency injection, not state management. Split state from
//   dispatch, guard with a throwing hook, and never export the raw context.
//
// NEXT TOPIC -> 05_useref-dom-mutable-ref.js
