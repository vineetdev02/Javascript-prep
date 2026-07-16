// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  03_context-api-provider-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Context API + Provider pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. The Provider PATTERN — not the hook, the architecture around it
//   2. The five rules of a production-grade context module
//   3. Split state/dispatch: 21 renders → 1, measured
//   4. Provider hell, and how composition escapes it
//   5. Context is DI, not state management — the line that matters
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/03_context-api-provider-pattern.js"
//
// Prerequisite: 02_built-in-hooks/04_usecontext-use-case.js — that file was
// the MECHANICS (lookup, re-renders). This one is the ARCHITECTURE.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The Provider pattern:
// Wrap a subtree in a Provider that owns some state, and expose it through a
// custom hook — so consumers depend on the HOOK, never on the context object.
//
// If interviewer says "explain it simply", say:
// "A Provider component owns the state and a custom hook reads it. Consumers
//  import useAuth(), not AuthContext. That indirection is the whole pattern."
//
// If interviewer asks "why does it matter?", say:
// "Because exporting the raw context couples every consumer to your
//  implementation. Export a hook and you can split the context, add a
//  selector, swap to Zustand, or add a guard — without touching a single
//  consumer. And the guard turns a missing Provider from a mysterious null
//  into an immediate, obvious error."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   dependency injection, not state management
//
// The pattern has three parts, and juniors ship only the first:
//
//   1. THE CONTEXT       createContext(undefined)   ← private, never exported
//   2. THE PROVIDER      owns the state, memoizes the value
//   3. THE HOOK          useAuth() — guards, and is the ONLY public API
//
// The complete module:
//
//   const AuthContext = createContext(undefined);      // ← NOT exported
//
//   export function AuthProvider({ children }) {
//     const [user, setUser] = useState(null);
//     const login = useCallback(async (creds) => { ... }, []);
//     const logout = useCallback(() => setUser(null), []);
//     const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
//     return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
//   }
//
//   export function useAuth() {                        // ← the ONLY export
//     const context = useContext(AuthContext);
//     if (context === undefined) {
//       throw new Error("useAuth must be used within an <AuthProvider>");
//     }
//     return context;
//   }
//
// Runtime rule:
//   Every consumer re-renders when the value changes by Object.is. There are
//   no selectors. That single fact drives every design decision below.
//
// Practical rule:
//   Context is for values that are (a) needed at many depths and (b) change
//   rarely. Theme, locale, the current user, a query client.
//
// Common trap:
//   Treating it as a Redux replacement. No selectors, no middleware, no
//   devtools, and every consumer re-renders. It is dependency injection.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE FIVE RULES
// ══════════════════════════════════════════════════════════════════
//
// RULE 1 — createContext(undefined), and guard in the hook.
//   ❌ createContext({ user: null })
//      A missing Provider silently gives you the default. Your app "works"
//      with a null user forever and you debug the wrong thing.
//   ✅ createContext(undefined) + throw in the hook.
//      A missing Provider is now a loud error naming the fix.
//
// RULE 2 — NEVER export the raw context.
//   Export only the Provider and the hook. Consumers that import the context
//   are coupled to your implementation and you can never change it.
//
// RULE 3 — useMemo the value.
//   value={{ user, login }} is a new object every render → every consumer
//   re-renders on every render of the Provider's parent, for nothing.
//   → 02_built-in-hooks/04_usecontext-use-case.js §6
//
// RULE 4 — Split state from dispatch.
//   Actions are stable; state changes. A component that only calls logout()
//   should not re-render when the user object changes. → §5
//
// RULE 5 — Put the Provider as LOW as it can go.
//   A Provider at the root re-renders the whole app on every change. If only
//   /settings needs it, wrap /settings.
//
// Rules 1 and 2 are about API design. Rules 3, 4 and 5 are all the same
// underlying fact: every consumer re-renders, so control the blast radius.

console.log("§3 — rule 1: the silent default vs the loud error:\n");

function createContext(defaultValue) {
  return { _default: defaultValue, _value: defaultValue, _hasProvider: false };
}

function useContext(context) {
  return context._hasProvider ? context._value : context._default;
}

// ❌ a plausible default
const BadContext = createContext({ user: null, login: () => {} });
function useBadAuth() { return useContext(BadContext); }

// ✅ undefined + a guard
const GoodContext = createContext(undefined);
function useGoodAuth() {
  const context = useContext(GoodContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return context;
}

console.log("  a component rendered WITHOUT its Provider:\n");
const bad = useBadAuth();
console.log("    createContext({user:null}) →", JSON.stringify(bad));
console.log("      🐛 no error. The app renders 'logged out' forever, and you");
console.log("         debug your auth API for an hour.");

let goodError;
try { useGoodAuth(); } catch (e) { goodError = e.message; }
console.log("\n    createContext(undefined) + guard →");
console.log("      💥", goodError);
console.log("      ✅ names the problem AND the fix, immediately, at the crash");
console.log("         site. This is the single highest-value line in the file.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — RULE 3: useMemo THE VALUE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — rule 3: the object literal:\n");

function providerValueChanged(prev, next) { return !Object.is(prev, next); }

// ❌ a new object every render
const makeBadValue = (user) => ({ user, logout: () => {} });
const bad1 = makeBadValue("vineet");
const bad2 = makeBadValue("vineet");        // the SAME user

// ✅ memoized on [user]
const cache = {};
const makeGoodValue = (user) => {
  if (cache.user !== user) { cache.user = user; cache.value = { user, logout: () => {} }; }
  return cache.value;
};
const good1 = makeGoodValue("vineet");
const good2 = makeGoodValue("vineet");
const good3 = makeGoodValue("ankit");       // a REAL change

console.log("  the Provider's parent re-renders; `user` did NOT change:\n");
console.log("    value={{ user, logout }}                  → changed?",
  providerValueChanged(bad1, bad2), "🐛 every consumer re-renders");
console.log("    useMemo(() => ({user, logout}), [user])   → changed?",
  providerValueChanged(good1, good2), "✅ consumers skip");
console.log("\n  and when the user genuinely changes:");
console.log("    useMemo version                          → changed?",
  providerValueChanged(good2, good3), "✅ correctly re-renders");
console.log("\n  Without the memo, ANY render of the Provider's parent — an");
console.log("  unrelated route change, a parent's own state — re-renders every");
console.log("  consumer in the app. Put that Provider at the root and you have");
console.log("  coupled your whole tree to one component's render cycle.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — RULE 4: SPLIT STATE FROM DISPATCH
// ══════════════════════════════════════════════════════════════════
//
// The structural fix, and the one that separates people who have read the
// docs from people who have profiled a real app.
//
//   The insight: setState and dispatch NEVER change identity. State does.
//   So put them in DIFFERENT contexts, and dispatch-only consumers never
//   re-render again after mount.
//
//   const StateContext = createContext(undefined);
//   const DispatchContext = createContext(undefined);
//
//   export function TodoProvider({ children }) {
//     const [state, dispatch] = useReducer(reducer, initial);
//     return (
//       <StateContext.Provider value={state}>
//         <DispatchContext.Provider value={dispatch}>
//           {children}
//         </DispatchContext.Provider>
//       </StateContext.Provider>
//     );
//   }
//
//   export const useTodos = () => useGuarded(StateContext, "useTodos");
//   export const useTodosDispatch = () => useGuarded(DispatchContext, "useTodosDispatch");
//
//   Note: no useMemo needed on either! `state` is already a stable reference
//   from useReducer, and `dispatch` never changes. Splitting removed the
//   object literal, which removed rule 3's problem entirely. Two rules, one fix.

console.log("§5 — split contexts, measured:\n");

function measureRenders({ split, consumers }) {
  // A state change happens. Who re-renders?
  return consumers.filter(c => {
    if (!split) return true;                    // combined: EVERY consumer
    return c.reads === "state";                 // split: only state readers
  }).length;
}

// A very typical shape: 1 display, 20 action buttons.
const consumers = [
  { name: "TodoList", reads: "state" },
  ...Array.from({ length: 20 }, (_, i) => ({ name: "AddButton" + i, reads: "dispatch" })),
];

const combined = measureRenders({ split: false, consumers });
const splitCount = measureRenders({ split: true, consumers });

console.log("  a todo app: 1 list renders the state, 20 buttons only dispatch.");
console.log("  the user types one character into a todo:\n");
console.log("    <Provider value={{state, dispatch}}>  →", combined, "re-render 🐛");
console.log("    <State.Provider> + <Dispatch.Provider> →", splitCount, "re-renders ✅");
console.log(`\n    ${combined}x fewer re-renders, for a five-line change.`);

console.log("\n  Why it works: dispatch's identity NEVER changes — useReducer");
console.log("  guarantees it. So the DispatchContext's value never changes, so");
console.log("  its consumers never re-render from it. The 20 buttons mount once");
console.log("  and are never touched again.");
console.log("\n  And the bonus: neither Provider needs useMemo. `state` is");
console.log("  already a stable reference and `dispatch` never changes, so the");
console.log("  object literal that rule 3 warned about does not exist anymore.");
console.log("  Splitting solved rule 3 for free.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — PROVIDER HELL, AND THE ESCAPE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — provider hell:\n");

const providers = ["Theme", "Auth", "Router", "Query", "Toast", "Modal", "I18n"];

console.log("  what every app's root eventually looks like:\n");
providers.forEach((p, i) => {
  console.log("  " + "  ".repeat(i) + `<${p}Provider>`);
});
console.log("  " + "  ".repeat(providers.length) + "<App />");
[...providers].reverse().forEach((p, i) => {
  console.log("  " + "  ".repeat(providers.length - 1 - i) + `</${p}Provider>`);
});

console.log("\n  Seven levels of nesting before your app starts. It is not a");
console.log("  performance problem — each Provider is one cheap fiber — it is a");
console.log("  READABILITY problem, and it makes tests miserable: every test");
console.log("  that renders anything now needs the same seven wrappers.");

console.log("\n  ✅ THE FIX — compose them, using the pattern from file 02:\n");
console.log("    const providers = [ThemeProvider, AuthProvider, RouterProvider];");
console.log("");
console.log("    function AppProviders({ children }) {");
console.log("      return providers.reduceRight(");
console.log("        (acc, Provider) => <Provider>{acc}</Provider>,");
console.log("        children");
console.log("      );");
console.log("    }");
console.log("");
console.log("    <AppProviders><App /></AppProviders>");

// Prove reduceRight builds the same nesting:
const nested = providers.reduceRight((acc, p) => `<${p}Provider>${acc}</${p}Provider>`, "<App/>");
console.log("\n    produces:", nested.slice(0, 62) + "...");
console.log("\n  Same tree, one line at the call site, and tests can import");
console.log("  AppProviders instead of reconstructing the stack.");
console.log("\n  ⚠️  But treat provider hell as a SIGNAL, not just a formatting");
console.log("     problem. Seven root providers usually means several of them");
console.log("     should be lower in the tree (rule 5), or are really server");
console.log("     data that belongs in React Query.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — CONTEXT IS NOT A STATE MANAGER
// ══════════════════════════════════════════════════════════════════
//
// The claim you will be asked to defend: "we don't need Redux, we have
// Context." Here is the honest comparison.
//
//                        Context          Redux / Zustand
//   ──────────────────────────────────────────────────────
//   selectors            ❌ none          ✅ subscribe to a SLICE
//   re-render control    ❌ all consumers ✅ only what changed
//   middleware           ❌               ✅ thunks, sagas, logging
//   devtools             ❌               ✅ time travel, action log
//   outside React        ❌               ✅ read/write from anywhere
//   async patterns       ❌ roll your own ✅ built in
//   boilerplate          ✅ minimal       ⚠️  more (much less with RTK)
//   bundle size          ✅ zero          ⚠️  a dependency
//
// The one that actually decides it: SELECTORS.
//
//   Redux:   const name = useSelector(s => s.user.name);
//            → re-renders ONLY when user.name changes.
//   Context: const { user } = useAuth();
//            → re-renders when ANY part of the value changes.
//
// You cannot build selectors on top of Context. People try — the
// use-context-selector library exists — and it needs useSyncExternalStore
// under the hood, which means it stopped being Context and became a store.
// That is the proof: the moment you need selectors, you need a store.
//
// The honest framing:
//   "Context is dependency injection. It answers 'how does this value get
//    here?' — not 'how is this value managed?'. For theme, locale, the
//    current user, or a query client, that is exactly right. For state that
//    changes often and is read in slices, it is the wrong tool, and the tell
//    is that you start wanting selectors."

console.log("§7 — the selector gap:\n");

const appState = { user: { name: "Vineet", email: "v@x.com" }, cart: [], theme: "dark" };
const contextConsumers = [
  { name: "Header", needs: "user.name" },
  { name: "CartIcon", needs: "cart.length" },
  { name: "ThemeToggle", needs: "theme" },
];

// Context: the value changed at all → everyone re-renders.
const contextRerenders = contextConsumers.length;
// A store with selectors: only whoever selected the changed slice.
const changedSlice = "user.name";
const storeRerenders = contextConsumers.filter(c => c.needs === changedSlice).length;

console.log("  state:", JSON.stringify(appState).slice(0, 56) + "...");
console.log("  `user.name` changes. Who re-renders?\n");
console.log("    Context (one value)     →", contextRerenders,
  "consumers 🐛 CartIcon and ThemeToggle too");
console.log("    Store (useSelector)     →", storeRerenders,
  "consumer  ✅ only the one that selected it");
console.log("\n  There is no way to close that gap with Context. It has no");
console.log("  concept of 'which part did you read'. use-context-selector");
console.log("  exists — and it is implemented with useSyncExternalStore, which");
console.log("  means it stopped being Context and became a store.");
console.log("  → 02_built-in-hooks/14_usesyncexternalstore.js\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL CODEBASES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Production
//   ───────────               ──────────
//   one context module        one FILE per context, exporting exactly the
//                             Provider and the hook(s). Nothing else.
//   n/a                       React 19: <Context> IS the Provider —
//                             <Context.Provider> is no longer required
//   n/a                       React 19's use(Context) can be called
//                             CONDITIONALLY, unlike useContext
//   n/a                       compound components put a PRIVATE context inside
//                             the component: <Select><Select.Option/></Select>.
//                             Context scoped to one component tree is its
//                             best use — no global re-render concerns.
//   n/a                       RSC: context does NOT work in server
//                             components. It is client-only, which is
//                             pushing apps toward props + server data.
//
// The compound-component point is the mature take: Context is at its best
// scoped SMALL — inside a Select, a Tabs, an Accordion — where the tree is
// tiny and the re-renders do not matter. The problems in this file all come
// from putting it at the ROOT.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Cannot read property 'name' of null":
//   A missing Provider and a plausible default. → §3. Guard it.
//
// Bug 2 — The whole app re-renders on every keystroke:
//   An unmemoized value object. → §4.
//
// Bug 3 — 20 buttons re-render when the state changes:
//   One combined context. → §5. Split it.
//
// Bug 4 — Every test needs 7 wrappers:
//   Provider hell. → §6. Export an AppProviders.
//
// Bug 5 — Consumers import the raw context and now you cannot refactor:
//   Rule 2 violated. Export only the hook.
//
// Bug 6 — Two React copies → context reads the default despite a Provider:
//   Two distinct context objects. The identity check fails.
//
// Bug 7 — Context used for server data:
//   Now you are hand-writing cache invalidation. → 10_react-query.js
//
// Bug 8 — Context used for high-frequency state:
//   Mouse position, form fields. Every consumer re-renders on every event.
//
// Bug 9 — Context in a server component:
//   It does not work. Client-only.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Rule 1 — the guard:
assert(bad.user === null,
  "a plausible default → a missing Provider fails SILENTLY 🐛");
assert(goodError.includes("must be used within"),
  "undefined + a guard → a loud error naming the fix ✅");
assert(goodError.includes("AuthProvider"),
  "...and naming the exact component to add");

// Rule 3 — the memo:
assert(providerValueChanged(bad1, bad2) === true,
  "an object literal: identical data, new reference, everyone re-renders");
assert(providerValueChanged(good1, good2) === false,
  "useMemo: same data, same reference, consumers skip");
assert(providerValueChanged(good2, good3) === true,
  "...and it still updates when the data really changes");

// Rule 4 — the split:
assert(combined === 21, "combined context: all 21 consumers re-render");
assert(splitCount === 1, "split: only the 1 state reader re-renders");
assert(combined / splitCount === 21, "21x fewer renders for a five-line change");

// Provider hell composes:
assert(nested.startsWith("<ThemeProvider>") && nested.includes("<App/>"),
  "reduceRight builds the same nesting from a flat array");
assert((nested.match(/Provider>/g) || []).length === providers.length * 2,
  "every provider is opened and closed exactly once");

// The selector gap:
assert(contextRerenders > storeRerenders,
  "context re-renders every consumer; a store re-renders only the selector match");
assert(storeRerenders === 1,
  "user.name changed → only the component that selected user.name");
assert(contextRerenders === 3,
  "...but with context, the CartIcon re-renders because the USER changed 🐛");

console.log("§10 — mini assertions passed for: Context API + Provider pattern");
console.log("\n  The two numbers to keep: 21 → 1 from splitting the context,");
console.log("  and 3 → 1 from having selectors at all. The first you can fix");
console.log("  with Context. The second you cannot.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you use the Context API properly?", answer like this:
//
//   "The pattern is three parts and most people ship only the first. A private
//    context, a Provider that owns the state, and a custom hook that's the
//    ONLY public API. Consumers import useAuth(), never AuthContext — that
//    indirection means I can split the context, add a selector, or swap to
//    Zustand without touching a single consumer.
//
//    The hook also guards. I use createContext(undefined) and throw if the
//    value is undefined, because a plausible default like { user: null } makes
//    a missing Provider fail SILENTLY — the app renders 'logged out' forever
//    and you debug your auth API instead. The guard turns that into an
//    immediate error naming the exact Provider to add.
//
//    Then the performance rules, which all come from one fact: every consumer
//    re-renders when the value changes, with no selectors. So memoize the value
//    object, or an unrelated parent render re-renders your whole app. Split
//    state from dispatch — in a todo app with one list and twenty buttons,
//    combined is 21 re-renders per keystroke and split is 1, because dispatch
//    identity never changes. And splitting removes the object literal, so you
//    don't even need the memo anymore. Two rules, one fix. Put the Provider as
//    low as it can go.
//
//    And I'd be clear that Context isn't a state manager — it's dependency
//    injection. It answers 'how does this value get here', not 'how is it
//    managed'. The tell is selectors: with Context, a change to user.name
//    re-renders your CartIcon too. You can't fix that — use-context-selector
//    exists and it's built on useSyncExternalStore, which means it stopped
//    being Context and became a store.
//
//    Honestly, Context is at its best scoped SMALL — a private context inside
//    a Select or Tabs component. Almost every problem in this list comes from
//    putting it at the root."
//
// The 21→1 number and "the tell is selectors" are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is the Provider pattern?
// A1. A private context, a Provider owning the state, and a custom hook as the
//     only public API.
//
// Q2. Why createContext(undefined)?
// A2. So a missing Provider throws instead of silently handing back a
//     plausible default.
//
// Q3. Why not export the context?
// A3. Consumers would couple to the implementation. Export the hook and you
//     can change everything behind it.
//
// Q4. Why useMemo the value?
// A4. An object literal is a new reference every render, so every consumer
//     re-renders on every render of the Provider's parent.
//
// Q5. Why split state and dispatch?
// A5. dispatch identity is stable, so dispatch-only consumers never re-render.
//     21 → 1 in a typical form. It also removes the need for the memo.
//
// Q6. Can Context replace Redux?
// A6. For dependency injection, yes. For state management, no — no selectors,
//     no middleware, no devtools, and every consumer re-renders.
//
// Q7. How do you escape provider hell?
// A7. reduceRight over an array of providers into one AppProviders component.
//     But treat it as a signal that some belong lower or in React Query.
//
// Q8. Where is Context at its best?
// A8. Scoped small — a private context inside a compound component. Root-level
//     context is where all the problems come from.
//
// Q9. Does Context work in RSC?
// A9. No. It is client-only.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What are the three parts of the pattern?
//   Back : A private context, a Provider, and a guarded custom hook.
//
// Flashcard 2:
//   Front: Why createContext(undefined)?
//   Back : So a missing Provider throws instead of failing silently.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : value={{...}} — a new object every render re-renders every consumer.
//
// Flashcard 4:
//   Front: What is the structural fix?
//   Back : Split state from dispatch. 21 renders → 1.
//
// Flashcard 5:
//   Front: Context vs Redux?
//   Back : DI vs state management. The tell is selectors.
//
// Flashcard 6:
//   Front: Where is Context best?
//   Back : Scoped small, inside a compound component.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Never export the raw context, and say "the tell is selectors."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the complete AuthContext module from memory: private context,
//   Provider with useMemo, guarded hook. Export exactly two things.
//
// Task 2:
//   Split it into State and Dispatch contexts. Confirm the Provider no longer
//   needs useMemo, and explain why.
//
// Task 3:
//   Write AppProviders with reduceRight. Then use it in a test helper. That is
//   the moment provider hell stops hurting.
//
// Task 4:
//   Try to add a selector to Context: useAuthSelector(s => s.user.name). Get
//   stuck. Then read use-context-selector's source and see
//   useSyncExternalStore. That is the proof.
//
// Task 5:
//   Take a root-level context in your app and ask whether it could live
//   inside one component instead. Half of them can.
//
// Task 6:
//   Explain in 60 seconds why splitting a context into two turns 21 renders
//   into 1, to someone who thinks it is a pointless refactor.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Export the HOOK, never the context. And guard it.
//
// If you remember the common bug:
//   An unmemoized value re-renders every consumer for nothing. A combined
//   context re-renders 21 components where 1 was needed.
//
// If you remember the professional framing:
//   Context is dependency injection, not state management. The tell is
//   selectors. And it is best scoped small, not at the root.
//
// NEXT TOPIC -> 04_redux-toolkit-createslice.js
