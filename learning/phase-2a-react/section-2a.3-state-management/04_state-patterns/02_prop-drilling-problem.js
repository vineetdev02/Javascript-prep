// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  02_prop-drilling-problem.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Prop drilling problem
//
// WHAT YOU WILL MASTER HERE:
//   1. What drilling actually costs — measured in components touched
//   2. COMPOSITION: the fix everyone forgets, and it needs no library
//   3. Why "pass the element as a prop" kills most drilling
//   4. When drilling is fine (it usually is)
//   5. The decision ladder: props → composition → context → store
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/02_prop-drilling-problem.js"
//
// Prerequisite: 01_lifting-state-up.js — drilling is the COST of lifting.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Prop drilling:
// Passing a prop through components that do not use it, just to reach a
// descendant that does.
//
// If interviewer says "explain it simply", say:
// "The state is five levels up and the consumer is five levels down, so four
//  components in between have to accept a prop and pass it along without ever
//  reading it."
//
// If interviewer asks "why does it matter?", say:
// "The real cost is not typing — it is COUPLING. Every intermediate component
//  now knows about a feature it has nothing to do with, so it cannot be
//  reused or tested without that prop. But the answer most people jump to —
//  Context — is usually wrong. Composition fixes most drilling with no
//  library and no re-render cost."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   the cost is COUPLING, not typing
//
// The shape:
//
//   <App user={user}>                  ← owns it
//     <Layout user={user}>             ← does not use it 🐛
//       <Sidebar user={user}>          ← does not use it 🐛
//         <UserPanel user={user}>      ← does not use it 🐛
//           <Avatar user={user} />     ← FINALLY uses it ✅
//
//   Four components touched. One of them needed it.
//
// What it actually costs:
//   1. COUPLING — Layout cannot be used on a page with no user
//   2. REFACTOR FRICTION — adding one field to Avatar means editing 4 files
//   3. NOISE — the signal (what does this component need?) is buried
//   4. TESTING — you must construct a user just to render Layout
//
// What it does NOT cost:
//   Performance. Passing a prop is free. The re-renders come from the state
//   being high in the tree (→ file 01), not from the passing.
//   That distinction matters: Context fixes the drilling, NOT the re-renders.
//
// Practical rule:
//   Two or three levels? Just pass it. Deeper? Try composition FIRST.
//
// Common trap:
//   Reaching for Context at the first sign of drilling, then discovering it
//   re-renders every consumer and you cannot select a slice.
//   → 02_built-in-hooks/04_usecontext-use-case.js


// ══════════════════════════════════════════════════════════════════
// § 3 — MEASURING THE COST
// ══════════════════════════════════════════════════════════════════

console.log("§3 — how many components does one prop touch?\n");

function buildChain(depth) {
  // A linear chain: App → Layout → Sidebar → ... → Avatar
  const names = ["App", "Layout", "Sidebar", "UserPanel", "ProfileCard",
    "CardBody", "Avatar"];
  return names.slice(0, depth + 1);
}

function drillCost(chain) {
  const owner = chain[0];
  const consumer = chain[chain.length - 1];
  const passthrough = chain.slice(1, -1);      // the ones that just pass it on
  return {
    touched: chain.length,
    passthrough: passthrough.length,
    names: passthrough,
    owner, consumer,
  };
}

console.log("  depth | components touched | pass-through (use it: NO)");
console.log("  ------|--------------------|---------------------------");
for (const depth of [2, 4, 6]) {
  const cost = drillCost(buildChain(depth));
  console.log(`  ${String(depth).padStart(5)} | ${String(cost.touched).padStart(18)} | ` +
    `${String(cost.passthrough).padStart(2)}  ${cost.names.join(" → ")}`);
}

console.log("\n  At depth 6, five components accept a `user` prop and four of");
console.log("  them never read it. Add `user.role` to Avatar and you edit four");
console.log("  files that do not care about roles.");
console.log("\n  But notice what is NOT on this table: renders. Passing a prop");
console.log("  costs nothing at runtime. The pain is entirely about coupling");
console.log("  and refactor friction — which is why the FIX is structural, not");
console.log("  a performance tool.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FIX EVERYONE FORGETS: COMPOSITION
// ══════════════════════════════════════════════════════════════════
//
// Before Context. Before Redux. This.
//
//   ❌ DRILLING — Layout must know about `user`:
//
//     function App() {
//       const [user] = useState(...);
//       return <Layout user={user} />;
//     }
//     function Layout({ user }) {
//       return <div><Sidebar user={user} /></div>;
//     }
//     function Sidebar({ user }) {
//       return <Avatar user={user} />;
//     }
//
//   ✅ COMPOSITION — pass the ELEMENT, not the data:
//
//     function App() {
//       const [user] = useState(...);
//       return (
//         <Layout sidebar={<Sidebar avatar={<Avatar user={user} />} />} />
//       );
//     }
//     function Layout({ sidebar }) {
//       return <div>{sidebar}</div>;      // ← knows nothing about user
//     }
//     function Sidebar({ avatar }) {
//       return <aside>{avatar}</aside>;   // ← knows nothing about user
//     }
//
// The JSX is created in App, where `user` is already in scope. Layout and
// Sidebar receive an opaque element and just place it. The `user` prop never
// travels through them — it was never IN them.
//
// This is what `children` already is:
//
//     <Layout>
//       <Sidebar>
//         <Avatar user={user} />       ← still App's JSX! Still App's scope.
//       </Sidebar>
//     </Layout>
//
// That is the version most people have written a thousand times without
// noticing it solves drilling. `children` is a hole you pass elements into,
// and elements carry their own props from wherever they were CREATED.

console.log("§4 — composition: the prop never travels:\n");

// Model it: which components have `user` in their props?
function drillingModel(chain) {
  // Everyone from the owner to the consumer receives it.
  return chain.slice(1).map(name => ({ name, receivesUser: true }));
}

function compositionModel(chain) {
  // Only the consumer receives it. The rest receive an opaque element.
  const consumer = chain[chain.length - 1];
  return chain.slice(1).map(name => ({
    name,
    receivesUser: name === consumer,
  }));
}

const chain = buildChain(4);   // App → Layout → Sidebar → UserPanel → ProfileCard
const drilled = drillingModel(chain);
const composed = compositionModel(chain);

console.log("  App owns `user`; ProfileCard renders it.\n");
console.log("  component     | drilling      | composition");
console.log("  --------------|---------------|-------------");
for (let i = 0; i < drilled.length; i++) {
  console.log(`  ${drilled[i].name.padEnd(13)} | ` +
    `${(drilled[i].receivesUser ? "user ✋" : "—").padEnd(13)} | ` +
    `${composed[i].receivesUser ? "user ✅" : "— (opaque element)"}`);
}

const drilledCoupled = drilled.filter(c => c.receivesUser).length;
const composedCoupled = composed.filter(c => c.receivesUser).length;
console.log(`\n  components coupled to \`user\`: drilling ${drilledCoupled},` +
  ` composition ${composedCoupled}`);
console.log("\n  Layout and Sidebar now take an ELEMENT they place into a hole.");
console.log("  They work on a page with no user, in a test with no user, and in");
console.log("  a Storybook story with a <div> in the slot. That is the win —");
console.log("  and there is no Provider, no context, and no extra re-render.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY COMPOSITION IS BETTER THAN CONTEXT HERE
// ══════════════════════════════════════════════════════════════════
//
// People jump from "drilling hurts" straight to Context. Compare honestly:
//
//   COMPOSITION                    CONTEXT
//   ───────────                    ───────
//   zero new concepts              a Provider, a hook, a default value
//   props stay explicit            data appears from nowhere
//   no extra re-renders            EVERY consumer re-renders on change
//   testable in isolation          needs a Provider wrapper in every test
//   works for one consumer         works for many, at many depths
//   the tree shape must allow it   works regardless of shape
//
// Composition's limitation is real: it only works when the OWNER can create
// the element. If the consumer's position is decided deep in the tree, or by
// a router, or by a list, you cannot hoist the JSX up.
//
//   e.g. every row in a 1000-row table needs `theme`. You are not passing
//   1000 pre-built elements from App. That is Context's case.
//
// The honest rule:
//   Composition for STRUCTURE (layouts, slots, wrappers).
//   Context for AMBIENT values (theme, locale, user, a client instance).
//
// And note: Context does NOT fix the re-render cost of lifting. It fixes the
// PLUMBING. If the value changes often, Context makes performance WORSE than
// drilling, because every consumer re-renders whether or not it uses the
// changed part. → 03_context-api-provider-pattern.js

console.log("§5 — the honest comparison:\n");

function renderCost(consumers, style, valueChanges) {
  if (style === "drilling") {
    // The owner re-renders; its subtree re-renders. Same as any lifted state.
    return { rerenders: consumers, note: "the owner's subtree" };
  }
  if (style === "context") {
    // EVERY consumer re-renders, regardless of what changed.
    return { rerenders: consumers * valueChanges, note: "every consumer, every change" };
  }
  return { rerenders: consumers, note: "the owner's subtree" };
}

console.log("  10 consumers, the value changes 3 times:\n");
for (const style of ["drilling", "composition", "context"]) {
  const c = renderCost(10, style, 3);
  console.log(`    ${style.padEnd(12)} → ${c.rerenders} re-renders (${c.note})`);
}
console.log("\n  Context does not reduce re-renders — that is the misconception.");
console.log("  It reduces PLUMBING. The re-render cost comes from the state");
console.log("  being high in the tree, and Context does not change that.");
console.log("  → 01_lifting-state-up.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHEN DRILLING IS FINE
// ══════════════════════════════════════════════════════════════════
//
// The senior half. Drilling has a real virtue people forget: it is EXPLICIT.
//
//   <Avatar user={user} />
//
//   You can see, in one line, exactly what Avatar needs. No Provider to find,
//   no hook to trace, no "where does this come from?" Ctrl-clicking through
//   three files.
//
// Drilling is fine when:
//   ✅ 2-3 levels. Genuinely. Just pass it.
//   ✅ the intermediate components are yours and stable
//   ✅ the prop is part of the component's real contract
//   ✅ there is exactly one consumer
//
// Drilling is a problem when:
//   ❌ 4+ levels of pure pass-through
//   ❌ many consumers at many depths
//   ❌ the intermediates are generic/reusable (a Layout should not know a user)
//   ❌ you are editing five files to add one field
//
// The thing to say:
//   "Prop drilling is a smell, not a sin. Two levels is not a problem worth
//    a Provider. I'd rather read an explicit prop than hunt for a context."
//
// Interviewers ask this expecting "drilling bad, context good". The nuanced
// answer stands out.

console.log("§6 — the explicitness trade:\n");
console.log("  drilling → <Avatar user={user} />");
console.log("             you can SEE what it needs. One line, no indirection.");
console.log("\n  context  → <Avatar />");
console.log("             ...needs what? Read the source. Find the Provider.");
console.log("             Hope nobody wrapped it in a second one.");
console.log("\n  That is a real trade. Context buys convenience and pays in");
console.log("  traceability. At 2-3 levels the drilling is cheaper than the");
console.log("  indirection it would replace.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE DECISION LADDER
// ══════════════════════════════════════════════════════════════════
//
// Climb it in order. Do not jump to rung 4.
//
//   1. PASS THE PROP
//      2-3 levels. Explicit, free, obvious. Stop here most of the time.
//
//   2. COMPOSITION — children / element props
//      The intermediates are structural (Layout, Card, Modal). Pass the
//      element, not the data. No library, no re-render cost, and the
//      intermediates become genuinely reusable.
//
//   3. CONTEXT
//      Many consumers, many depths, the value changes RARELY.
//      Theme, locale, current user, a query client, a router.
//      Cost: every consumer re-renders on change; no selectors.
//      → 03_context-api-provider-pattern.js
//
//   4. A STORE — Zustand / Redux / Jotai
//      Many consumers AND it changes often, or you need selectors,
//      middleware, or devtools.
//      → 04-09
//
//   ⚠️  AND THE ONE PEOPLE MISS:
//      If it is SERVER data, none of the above. React Query.
//      Most "we need Redux" conversations are really "we are hand-caching
//      server data in a client store". → 10
//
// The senior instinct: most drilling complaints are solved at rung 2, and
// most Redux proposals are solved at rung 5.

console.log("§7 — the ladder, applied:\n");

const scenarios = [
  { need: "a modal's onClose, 2 levels down", answer: "1. pass the prop" },
  { need: "a Layout that renders a user-aware Sidebar", answer: "2. composition" },
  { need: "theme, needed by 40 components at all depths", answer: "3. context" },
  { need: "cart state, changes per click, 20 consumers", answer: "4. a store" },
  { need: "the product list from /api/products", answer: "5. React Query" },
];

for (const s of scenarios) {
  console.log(`    ${s.need.padEnd(46)} → ${s.answer}`);
}
console.log("\n  Note rows 3 and 4. The DIFFERENCE is not how many consumers —");
console.log("  it is how OFTEN it changes. Context with a fast-changing value");
console.log("  re-renders all 40 consumers on every change, which is worse than");
console.log("  drilling. Frequency is the deciding variable, not depth.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL CODEBASES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Production
//   ───────────               ──────────
//   one children slot         NAMED slots: <Layout header={} sidebar={}
//                             footer={} /> — this is the compound component
//                             pattern, and it is composition with a nicer API
//   n/a                       RSC changes this: a server component can fetch
//                             and pass an element to a client component, so
//                             drilling data through client boundaries mostly
//                             disappears
//   n/a                       the "container/presentational" split was an
//                             earlier answer to the same problem — hooks made
//                             it unnecessary, but composition survived
//   n/a                       Radix/Headless UI use compound components +
//                             internal context: <Select><Select.Option/></Select>
//                             — composition for structure, context for the
//                             shared internal state. That combination is the
//                             mature answer.
//
// The Radix point is the good one: real libraries use BOTH. Composition for
// the tree shape, and a private context for the state that genuinely must be
// ambient. Not either/or.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Editing five files to add one field:
//   Pure pass-through. → §3.
//
// Bug 2 — Layout cannot be reused on a logged-out page:
//   It requires a `user` prop it never reads. → §4.
//
// Bug 3 — Every test needs a full user object:
//   Same coupling. Composition fixes both.
//
// Bug 4 — Context "solved" drilling and now everything re-renders:
//   Context does not reduce re-renders. → §5. Split it, or use a store.
//
// Bug 5 — "Where does this prop come from?":
//   Over-contexting. You traded explicitness for convenience.
//
// Bug 6 — Redux added for what was three levels of drilling:
//   Rung 4 for a rung 1 problem.
//
// Bug 7 — A store full of server data:
//   Rung 4 for a rung 5 problem. → §7.
//
// Bug 8 — Passing 12 props to avoid "drilling":
//   You drilled an object's worth of fields. Pass the object, or compose.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The cost:
const deep = drillCost(buildChain(6));
assert(deep.touched === 7, "a 6-deep chain touches 7 components");
assert(deep.passthrough === 5,
  "five of them accept `user` and never read it");
assert(deep.passthrough > 0 && deep.consumer === "Avatar",
  "only the last one actually uses it");

// Composition removes the coupling:
assert(drilledCoupled === 4, "drilling: 4 components coupled to `user`");
assert(composedCoupled === 1, "composition: only the consumer is coupled ✅");
assert(composedCoupled < drilledCoupled,
  "composition removes the coupling with no library and no Provider");
assert(composed.find(c => c.name === "Layout").receivesUser === false,
  "Layout no longer knows a user exists — it just places an element");

// Context does not fix re-renders:
assert(renderCost(10, "context", 3).rerenders > renderCost(10, "drilling", 3).rerenders,
  "context re-renders every consumer on every change — it fixes PLUMBING, " +
  "not performance");
assert(renderCost(10, "composition", 3).rerenders === renderCost(10, "drilling", 3).rerenders,
  "composition has the same render cost as drilling — it is a structural fix");

console.log("§10 — mini assertions passed for: Prop drilling");
console.log("\n  The number that matters: 4 components coupled with drilling,");
console.log("  1 with composition. Same tree, same data, no Provider.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you solve prop drilling?", answer like this:
//
//   "First I'd push back on the framing. The cost of drilling isn't typing,
//    it's COUPLING — a Layout that takes a `user` prop it never reads can't be
//    used on a logged-out page or rendered in a test without constructing a
//    user. And notably it costs nothing at runtime; passing a prop is free.
//    The re-renders come from the state being high in the tree, not from the
//    passing.
//
//    That matters because the reflex answer — Context — fixes the plumbing but
//    NOT the re-renders. If anything it's worse: every consumer re-renders on
//    every change, with no selectors.
//
//    The fix most people skip is composition. Instead of passing `user` down
//    through Layout and Sidebar, App creates the element — <Layout
//    sidebar={<Sidebar avatar={<Avatar user={user} />} />} — and the
//    intermediates receive an opaque element they place into a hole. The prop
//    never travels through them because it was never in them. That's what
//    `children` already is: a slot for JSX created in the parent's scope. No
//    library, no Provider, no extra render.
//
//    Composition's limit is that the owner has to be able to create the
//    element. If a thousand table rows each need the theme, you're not passing
//    a thousand elements from App — that's genuinely Context's case.
//
//    So the ladder is: pass the prop at two or three levels, composition when
//    the intermediates are structural, Context for ambient values that change
//    rarely, a store when it changes often or you need selectors. And if it's
//    server data, none of them — React Query. Most 'we need Redux'
//    conversations are really 'we're hand-caching server data'.
//
//    Honestly, drilling is a smell, not a sin. Two levels is fine. I'd rather
//    read an explicit prop than hunt for a Provider."
//
// The composition point plus "context doesn't fix re-renders" is what makes
// this a senior answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does prop drilling actually cost?
// A1. Coupling and refactor friction. Not performance — passing props is free.
//
// Q2. Does Context fix the re-render cost?
// A2. No. It fixes plumbing. Every consumer re-renders on every change, with
//     no selectors — often worse than drilling.
//
// Q3. What is the composition fix?
// A3. Pass the ELEMENT, not the data. The JSX is created where the data is in
//     scope, so intermediates never see the prop.
//
// Q4. Is `children` composition?
// A4. Yes — it is the same mechanism. Elements carry props from where they
//     were created, not where they are rendered.
//
// Q5. When does composition NOT work?
// A5. When the owner cannot create the element — deep dynamic positions, list
//     rows, router-decided placement.
//
// Q6. When is drilling fine?
// A6. Two or three levels, one consumer, stable intermediates. It is also more
//     explicit than context.
//
// Q7. What decides Context vs a store?
// A7. How OFTEN it changes, not how many consumers. Frequent changes with
//     many consumers need selectors, which Context does not have.
//
// Q8. What do real libraries do?
// A8. Both — compound components for structure plus a private internal
//     context for shared state. Radix is the canonical example.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is prop drilling?
//   Back : Passing a prop through components that do not use it.
//
// Flashcard 2:
//   Front: What does it cost?
//   Back : Coupling, not performance. Passing props is free.
//
// Flashcard 3:
//   Front: What is the forgotten fix?
//   Back : Composition — pass the ELEMENT, not the data.
//
// Flashcard 4:
//   Front: Does Context fix re-renders?
//   Back : No. It fixes plumbing. Every consumer still re-renders.
//
// Flashcard 5:
//   Front: When is drilling fine?
//   Back : 2-3 levels. It is explicit, and explicit is a feature.
//
// Flashcard 6:
//   Front: Context or a store?
//   Back : How OFTEN it changes decides, not how many consumers.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Lead with composition, and say drilling is a smell not a sin.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take a 5-level drill and refactor it to composition. Count the files you
//   had to change afterwards to add a second field.
//
// Task 2:
//   Convert <Layout sidebar={} /> to named slots and then to a compound
//   component (<Layout><Layout.Sidebar/></Layout>). Which reads better at 3
//   slots? At 8?
//
// Task 3:
//   Build the 1000-row table case where composition genuinely fails. Now you
//   have PROVEN Context's use case rather than assumed it.
//
// Task 4:
//   Take a codebase context you have and ask: could this be composition? Half
//   of them can.
//
// Task 5:
//   Model the re-render cost of drilling vs context vs a store with selectors,
//   for 40 consumers and a value that changes per keystroke. That table is
//   your argument in the next architecture meeting.
//
// Task 6:
//   Explain in 60 seconds why Context is not a performance fix, to someone
//   about to "fix prop drilling" with a Provider at the root.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The cost is COUPLING, not performance. And composition fixes it with no
//   library.
//
// If you remember the common bug:
//   Reaching for Context to "fix drilling", then discovering it re-renders
//   every consumer and has no selectors.
//
// If you remember the professional framing:
//   The ladder: prop → composition → context → store → React Query. Climb it
//   in order. Drilling two levels is not a problem.
//
// NEXT TOPIC -> 03_context-api-provider-pattern.js
