// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  04_container-presentational-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Container / Presentational Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. The split: WHERE data comes from vs WHAT it looks like
//   2. Why a mixed component is untestable — counted, from its own source
//   3. Purity: same props → same output, proven twice over
//   4. One view, three data sources, zero changes to the view
//   5. Why Dan Abramov — who named the pattern — stopped recommending it
//   6. What replaced it: custom hooks, then Server Components
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/04_container-presentational-pattern.js"
//
// Prerequisites: 03_custom-hooks/02_usefetch-custom-hook.js and
// 03_higher-order-components-hoc.js.
//
// 01-03 were about sharing behaviour between components. This file is about a
// line INSIDE one component: the boundary between data and pixels. It is the
// oldest pattern in the section and the one whose author has publicly moved
// on — which makes "do you still use it?" a real interview question.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Container / Presentational:
// Split a component in two — a CONTAINER that knows where data comes from and
// how it changes, and a PRESENTATIONAL component that only knows what things
// look like, given props.
//
//   // container — no markup
//   function UserListContainer() {
//     const { data, loading, error } = useQuery("/api/users");
//     return <UserList users={data} loading={loading} error={error} />;
//   }
//
//   // presentational — no fetching, no store, no router
//   function UserList({ users, loading, error }) { … }
//
// Also called: smart/dumb, stateful/stateless, logic/view.
//
// If interviewer says "explain it simply", say:
// "One component answers 'where does this data come from?' and the other
//  answers 'what does it look like?'. The second one is a pure function of its
//  props — it can be rendered in a test, in Storybook, or in a different app,
//  with a plain object and nothing else."
//
// If interviewer asks "why does it matter?", say:
// "Because the view is the part that changes for design reasons and the data
//  layer is the part that changes for backend reasons, and they change on
//  different schedules. Keeping the seam means a REST-to-GraphQL migration
//  doesn't touch a single line of markup. But I'd add that hooks made the
//  literal two-component version mostly unnecessary — the seam moved from a
//  component boundary to a hook boundary."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   THE SEAM. Not two files — one boundary, wherever it lives.
//
// Runtime rule:
//   A presentational component is a PURE FUNCTION of props: same props in,
//   identical output out, no side effects, no I/O, no globals. That property
//   is what makes it testable, and it is the whole pattern.
//
// Practical rule:
//   Split when the view will outlive the data source, or when the view has
//   several states you want to see without a backend (loading, empty, error,
//   data, too-many).
//
// Common trap:
//   Splitting EVERY component mechanically. Two files, a prop-drilling layer
//   and a directory called containers/ that mirrors components/ exactly. That
//   is ceremony, not architecture — and it is what Abramov reacted against.
//
// The mental picture:
//
//   mixed component            container / presentational
//   ───────────────            ──────────────────────────
//   fetch + format + markup    fetch  |  markup
//   needs a server to render   renders from a plain object
//   one way to look at it      N states, on demand
//   swap the API → rewrite     swap the API → new container only


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM: A COMPONENT YOU CANNOT RENDER
// ══════════════════════════════════════════════════════════════════

console.log("§3 — how much of the world one component drags in:\n");

// ❌ The mixed component. Every line of it is reasonable on its own.
function UserPanelMixed(props) {
  const currentUser = useAuth();
  const { teamId } = useParams();
  const rows = fetch(`/api/teams/${teamId}/users`);
  const density = useStore("ui.density");
  return { rows, currentUser, density };
}

// Do not take my word for what it depends on — read its source.
const externalDeps = ["fetch(", "useAuth(", "useParams(", "useStore("]
  .filter(d => String(UserPanelMixed).includes(d));

console.log("    <UserPanelMixed> touches:", externalDeps.map(d => d.replace("(", "()")).join(", "));
console.log("    things you must stub to render it once:", externalDeps.length);
console.log("\n    So, to see the EMPTY state — a design question — you need:");
console.log("      a mock server, a router context, an auth context and a store.");
console.log("    To see the ERROR state you need the mock server to fail on demand.");
console.log("    To see it in Storybook you need all four, per story.");
console.log("\n  None of that is about how the panel LOOKS, which is the only thing");
console.log("  a designer, a test, or a visual-regression snapshot cares about.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE SPLIT, AND WHAT PURITY BUYS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same panel, cut in two:\n");

// ── a small React, enough to prove everything here ────────────────
function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}

function createRenderer() {
  let depth = 0, maxDepth = 0;
  const counts = {};
  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props } = node;
    if (typeof type === "function") {
      counts[type.name] = (counts[type.name] || 0) + 1;
      depth++; maxDepth = Math.max(maxDepth, depth);
      const out = render(type(props));
      depth--;
      return out;
    }
    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }
  return {
    render: n => { depth = 0; return render(n); },
    maxDepth: () => maxDepth,
    count: n => counts[n] || 0,
  };
}

// ✅ PRESENTATIONAL. Read the whole thing: no fetch, no hooks, no globals.
function UserList(props) {
  if (props.error) return h("div", null, `error: ${props.error}`);
  if (props.loading) return h("div", null, "loading…");
  if (props.users.length === 0) return h("div", null, "no teammates yet");
  return h("ul", null, props.users.map(u => h("li", null, `${u.name} (${u.role})`)));
}

const presentationalDeps = ["fetch(", "useAuth(", "useParams(", "useStore("]
  .filter(d => String(UserList).includes(d));

// ✅ CONTAINER. Read the whole thing: no markup at all.
function UserListContainer(props) {
  const { data, loading, error } = props.source();     // stands in for useQuery
  return h(UserList, { users: data, loading, error });
}

const containerMarkup = ["h(\"ul\"", "h(\"li\"", "h(\"div\""]
  .filter(m => String(UserListContainer).includes(m));

console.log("    <UserList>          external dependencies:", presentationalDeps.length);
console.log("    <UserListContainer> markup elements       :", containerMarkup.length);

// Purity, demonstrated rather than claimed: same props twice, byte-identical out.
const r1 = createRenderer();
const propsIn = { users: [{ name: "Asha", role: "admin" }, { name: "Vineet", role: "dev" }], loading: false, error: null };
const runA = r1.render(h(UserList, propsIn));
const runB = r1.render(h(UserList, propsIn));

console.log("\n    render #1:", JSON.stringify(runA));
console.log("    render #2:", JSON.stringify(runB));
console.log("    identical:", JSON.stringify(runA) === JSON.stringify(runB), "✅ pure function of props");
console.log("\n  That equality is the entire value of the pattern. It means a test,");
console.log("  a snapshot, a Storybook story and a visual-diff tool can all drive");
console.log("  this component with a literal object and get a deterministic result.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — ONE VIEW, THREE DATA SOURCES
// ══════════════════════════════════════════════════════════════════

console.log("§5 — swapping the backend without touching the markup:\n");

const restSource = () => ({
  data: [{ name: "Asha", role: "admin" }, { name: "Vineet", role: "dev" }],
  loading: false, error: null,
});
const graphqlSource = () => ({
  // different wire shape — the container is where the mapping belongs
  data: [{ node: { fullName: "Asha", position: "admin" } }, { node: { fullName: "Vineet", position: "dev" } }]
    .map(e => ({ name: e.node.fullName, role: e.node.position })),
  loading: false, error: null,
});
const offlineSource = () => ({
  data: JSON.parse('[{"name":"Asha","role":"admin"},{"name":"Vineet","role":"dev"}]'),
  loading: false, error: null,
});

const r2 = createRenderer();
const viaRest = r2.render(h(UserListContainer, { source: restSource }));
const viaGraphql = r2.render(h(UserListContainer, { source: graphqlSource }));
const viaOffline = r2.render(h(UserListContainer, { source: offlineSource }));

console.log("    REST      →", JSON.stringify(viaRest));
console.log("    GraphQL   →", JSON.stringify(viaGraphql));
console.log("    localStorage →", JSON.stringify(viaOffline));
console.log("\n    all three identical:",
  JSON.stringify(viaRest) === JSON.stringify(viaGraphql) &&
  JSON.stringify(viaRest) === JSON.stringify(viaOffline), "✅");
console.log("    lines of <UserList> changed to support all three: 0");

console.log("\n  The GraphQL source returns a completely different wire shape —");
console.log("  { node: { fullName } } — and the normalization happens in the");
console.log("  container, which is exactly where a backend concern belongs. The");
console.log("  view never learns that the API changed.");
console.log("\n  This is the argument that survives every rewrite of the pattern:");
console.log("  a VIEW MODEL. The view's props are a contract you control, not the");
console.log("  shape some endpoint happens to return this quarter.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE FOUR STATES, WITHOUT A BACKEND
// ══════════════════════════════════════════════════════════════════

console.log("§6 — every UI state, from four plain objects:\n");

const states = [
  ["loading", { users: [], loading: true, error: null }],
  ["error  ", { users: [], loading: false, error: "500" }],
  ["empty  ", { users: [], loading: false, error: null }],
  ["data   ", { users: [{ name: "Asha", role: "admin" }], loading: false, error: null }],
];

const r3 = createRenderer();
const rendered = states.map(([label, props]) => {
  const out = r3.render(h(UserList, props));
  console.log(`    ${label} → ${JSON.stringify(out)}`);
  return out;
});

const distinct = new Set(rendered.map(o => JSON.stringify(o))).size;
console.log("\n    states rendered:", rendered.length, " distinct outputs:", distinct, " mocks required: 0");

console.log("\n  Four stories, four tests, four visual snapshots — and no server,");
console.log("  no router, no auth. Compare with §3, where seeing the EMPTY state");
console.log("  meant standing up four dependencies.");
console.log("\n  This is also the part people skip. Loading, error and empty are the");
console.log("  states users actually hit on a bad network, and they are the states");
console.log("  nobody designs — because they are the hardest ones to LOOK at. Make");
console.log("  them cheap to look at and they get designed.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT HOOKS DID TO THIS PATTERN
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the seam moved:\n");

// Dan Abramov named this pattern in 2015 and added a note to that post in 2019:
// "I don't suggest splitting your components like this anymore. If you find it
//  natural in your codebase, this pattern can be handy. But I've seen it
//  enforced without any necessity... Hooks let you do the same thing without
//  an arbitrary division."
//
// Read what that actually says. The DIVISION was arbitrary — a component
// boundary. The SEPARATION was not. A custom hook is the container:

function useTeamUsers(source) {
  return source();                    // fetching, caching, retries, mapping
}

// The 2019+ shape: the hook is the container, and there is no wrapper left.
function UserListWithHook(props) {
  const { data, loading, error } = useTeamUsers(props.source);   // ← the container
  if (error) return h("div", null, `error: ${error}`);           // ← the view
  if (loading) return h("div", null, "loading…");
  if (data.length === 0) return h("div", null, "no teammates yet");
  return h("ul", null, data.map(u => h("li", null, `${u.name} (${u.role})`)));
}

const r4 = createRenderer();
const hookOut = r4.render(h(UserListWithHook, { source: restSource }));
const hookDepth = r4.maxDepth();

const r5 = createRenderer();
r5.render(h(UserListContainer, { source: restSource }));
const containerDepth = r5.maxDepth();

console.log("    container + presentational → component layers:", containerDepth);
console.log("    custom hook + one component → component layers:", hookDepth, "(a hook is not a component)");
console.log("    identical output           :", JSON.stringify(hookOut) === JSON.stringify(viaRest), "✅");
console.log("    stubs needed to test the DATA logic:", 0, "— call useTeamUsers directly");

console.log("\n  What you keep with hooks:");
console.log("    • the data logic is reusable and testable on its own — it is a");
console.log("      plain function, so it needs no renderer at all");
console.log("    • the view model is still a contract you own, not the API's shape");
console.log("    • the markup below the hook call still reads top-to-bottom as a view");
console.log("  What you drop:");
console.log("    • a component whose entire job was to pass props down");
console.log("    • a containers/ directory mirroring components/");
console.log("    • the argument about which folder a file belongs in");
console.log("\n  And the honest cost, said out loud: with one component you can no");
console.log("  longer render the view from a plain object, so §6's four free states");
console.log("  are gone. That is the actual trade — a layer of indirection against");
console.log("  the ability to look at your own error state.");
console.log("\n  So the 2025 answer is: keep the SEPARATION (the hook), and promote it");
console.log("  back to a second COMPONENT the moment you can name the second");
console.log("  consumer — a Storybook story, a design system, a second data source.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE PATTERN'S DESCENDANTS
// ══════════════════════════════════════════════════════════════════
//
// The same seam, drawn in four different places across ten years:
//
//   2015  container component      <UserListContainer> → <UserList>
//   2016  connect(mapState)(View)  redux drew the seam for you        → 03
//   2019  custom hook              useUsers() inside the view         → §7
//   2023  Server Component         async server fetch → client view   → below
//   ————  headless component       logic in a hook, markup by caller  → 11
//
// React Server Components are this pattern with the boundary moved onto the
// NETWORK:
//
//   // page.tsx — Server Component. The container. Never ships to the browser.
//   export default async function Page({ params }) {
//     const users = await db.users.byTeam(params.teamId);
//     return <UserList users={users} />;
//   }
//
//   // UserList.tsx — "use client". The presentational component.
//
// Everything the pattern ever promised is now enforced by the runtime instead
// of by convention: the container CANNOT contain interactive markup, the view
// CANNOT fetch, and the container's code is not in the bundle at all. That is
// the strongest version of this idea anyone has shipped, and it is a good
// thing to say out loud in an interview — it shows you see the pattern, not
// just the 2015 spelling of it.
// → 05_optimization-techniques/14_hydration-performance.js


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN TO SPLIT, AND WHEN NOT TO
// ══════════════════════════════════════════════════════════════════
//
// SPLIT when:
//   • the view is reused with more than one data source (§5)
//   • the view has states that are hard to reach live — error, empty,
//     rate-limited, 10,000 rows (§6)
//   • you have designers or a design system consuming it in isolation
//   • the component is > ~150 lines and half of it is data plumbing
//   • the data layer is about to change (REST → GraphQL, page → infinite)
//
// DO NOT SPLIT when:
//   • the component is used once, with one source, and always will be
//   • the "container" would be three lines that only forward props
//   • you are creating containers/ and components/ mirrors on principle
//   • the split forces you to prop-drill five values through a layer that
//     understands none of them
//
// The senior test: can you NAME what the presentational component would be
// reused for? If the answer is "nothing, but it's cleaner", you are adding a
// file, not a boundary.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The "presentational" component quietly grows a useEffect:
//   Now it is not pure, the Storybook story breaks in CI, and nobody notices
//   until the snapshot test fails for an unrelated reason. → §4.
//
// Bug 2 — The view takes the raw API shape as props:
//   { node: { fullName } } leaks into the markup, and the GraphQL migration
//   touches every component. Map in the container. → §5.
//
// Bug 3 — Prop drilling through the split:
//   The container passes 14 props because it refuses to let the view use
//   context. The split made the code worse.
//   → 04_state-patterns/02_prop-drilling-problem.js
//
// Bug 4 — Only the happy path is ever rendered:
//   Nobody built the loading/error/empty stories, so those states ship
//   unstyled. This is the cost of NOT splitting. → §6.
//
// Bug 5 — Two sources of truth after the split:
//   The container holds `users` and the view keeps its own copy in useState,
//   which drifts. The view must derive, not duplicate.
//   → 04_state-patterns/12_derived-state.js
//
// Bug 6 — A containers/ folder mirroring components/:
//   Not a crash — a permanent tax on every rename and every new file. → §9.
//
// Bug 7 — Server/client boundary in the wrong place (the modern version):
//   Marking the whole page "use client" to use one onClick, so the data
//   fetching ships to the browser too. → §8.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The problem:
assert(externalDeps.length === 4, "the mixed component needs 4 stubs to render once 🐛");

// The split:
assert(presentationalDeps.length === 0, "the presentational component needs ZERO ✅");
assert(containerMarkup.length === 0, "...and the container contains no markup ✅");

// Purity:
assert(JSON.stringify(runA) === JSON.stringify(runB),
  "same props → identical output. That IS the definition of presentational.");
assert(runA.includes("Asha (admin)"), "and it rendered the data it was given");

// One view, three sources:
assert(JSON.stringify(viaRest) === JSON.stringify(viaGraphql),
  "a totally different wire shape produces identical markup ✅");
assert(JSON.stringify(viaRest) === JSON.stringify(viaOffline),
  "so does reading from localStorage — the view never knows");
assert(String(UserList).includes("props.users"),
  "because the view speaks the VIEW MODEL, not the API shape");

// Four states, zero mocks:
assert(rendered.length === 4 && distinct === 4,
  "loading, error, empty and data — four distinct outputs from four objects ✅");
assert(rendered[0].includes("loading…"), "loading state rendered without a network");
assert(rendered[1].includes("error: 500"), "error state rendered without a failing server");
assert(rendered[2].includes("no teammates yet"), "empty state rendered without an empty database");

// Hooks moved the seam:
assert(JSON.stringify(hookOut) === JSON.stringify(viaRest),
  "the hook version produces the same UI as the container version");
assert(containerDepth === 2 && hookDepth === 1,
  "the hook version drops the component that existed only to forward props");
assert(String(UserListWithHook).includes("useTeamUsers"),
  "the custom hook IS the container now — the seam survived, the wrapper did not");

console.log("§11 — mini assertions passed for: Container / Presentational Pattern");
console.log("\n  The pair that captures it: the mixed component needed 4 stubs to");
console.log("  render at all, and the presentational one rendered 4 distinct UI");
console.log("  states from 4 plain objects with 0. Three different backends produced");
console.log("  byte-identical markup.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the container/presentational pattern?", answer:
//
//   "You split a component along one seam: the container knows where the data
//    comes from and how it changes, and the presentational component knows
//    what it looks like given props. The presentational half is a pure
//    function of props — no fetching, no store, no router — so the same props
//    always produce the same output.
//
//    The reason that matters is testability and change rate. A mixed component
//    that fetches, reads auth, reads the router and reads a store needs four
//    things stubbed before you can render it once, which means the loading,
//    error and empty states are expensive to even LOOK at — so they end up
//    unstyled. Split it and those states are four plain objects. And because
//    the view's props are a view model rather than the API's wire shape, a
//    REST-to-GraphQL migration changes the container and zero lines of markup.
//
//    The part I'd add is that the literal two-component version is mostly
//    obsolete, and the person who named the pattern said so — Abramov added a
//    note to that 2015 post saying he no longer suggests splitting components
//    this way, because hooks do the same thing without an arbitrary division.
//    A custom hook IS the container: useTeamUsers() at the top of the
//    component, and the rest of the function is the view. You keep the
//    separation and drop the component whose only job was to pass props down.
//
//    So my rule is: keep the seam, and only make it a component boundary when
//    the view is genuinely used with more than one data source, or when a
//    design system consumes it in isolation. Otherwise you're building a
//    containers/ folder that mirrors components/ and taxing every rename.
//
//    And the pattern isn't gone — it moved. Server Components are the same
//    split with the boundary on the network: an async server component
//    fetches, a 'use client' component renders. What used to be a convention
//    is now enforced by the runtime, and the container's code never reaches
//    the browser at all."
//
// Quoting Abramov's retraction accurately, and then landing on RSC, is what
// makes this answer current instead of a 2016 answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What makes a component "presentational"?
// A1. It is a pure function of props. No I/O, no subscriptions, no globals.
//     Same props → same output.
//
// Q2. Is the pattern dead?
// A2. The two-component spelling mostly is. The separation is not — it lives
//     in custom hooks, and in the server/client boundary.
//
// Q3. Why did Abramov walk it back?
// A3. Because it got enforced mechanically, and hooks achieve the same
//     separation without an arbitrary component boundary.
//
// Q4. Can a presentational component have state?
// A4. Yes — UI-local state like "is this row expanded" is still presentational.
//     What it must not have is data-source knowledge.
//
// Q5. What is a view model and why does it matter?
// A5. The prop shape the view declares, independent of any API. It is what
//     makes the backend swappable and the component reusable.
//
// Q6. How does this relate to headless components?
// A6. Headless is the same split with the view given back to the CALLER
//     instead of to a sibling file. → 11_headless-components.js
//
// Q7. Where does the loading state belong?
// A7. The container decides it; the view renders it. The view takes `loading`
//     as a prop so the loading UI is designable in isolation.
//
// Q8. Does this pattern cause prop drilling?
// A8. It can, if the container refuses to let the view use context. That is a
//     misapplication, and it is the most common one.
//
// Q9. How do Server Components change the answer?
// A9. The boundary becomes physical: server code never ships, client code
//     cannot fetch from the database. Convention becomes constraint.
//
// Q10. When would you refuse to split?
// A10. When you cannot name a second consumer for the view. "It's cleaner" is
//      not a consumer.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Container vs presentational?
//   Back : Where the data comes from vs what it looks like.
//
// Flashcard 2:
//   Front: Defining property of a presentational component?
//   Back : Pure function of props. Same props → same output.
//
// Flashcard 3:
//   Front: What does the split actually buy?
//   Back : Testable states, a swappable backend, a designable view.
//
// Flashcard 4:
//   Front: What is a view model?
//   Back : The prop contract the view owns — not the API's wire shape.
//
// Flashcard 5:
//   Front: What replaced the container component?
//   Back : A custom hook. The seam stayed, the wrapper went.
//
// Flashcard 6:
//   Front: The modern enforcement of this pattern?
//   Back : Server Components. Server fetches, client renders, boundary is real.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Keep the separation, drop the arbitrary division — Abramov's own
//          retraction. Split into two components only when you can name the
//          second consumer."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take a component that fetches and renders. List every global it touches.
//   That count is your §3 number.
//
// Task 2:
//   Split it. Then render the presentational half four times — loading, error,
//   empty, data — with literal objects and no mocks.
//
// Task 3:
//   Write a second container for the same view that reads from localStorage.
//   Confirm the view file did not change.
//
// Task 4:
//   Change the API shape on purpose. Fix it in the container only.
//
// Task 5:
//   Now delete the container component and replace it with a custom hook.
//   Diff the two versions and decide honestly which you prefer, and why.
//
// Task 6:
//   Convert the same pair to a Server Component + "use client" view. Check the
//   network tab: the container's code should not be in the bundle.
//
// Task 7:
//   Find a container in your codebase that only forwards props. Delete it.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The presentational component is a PURE FUNCTION OF PROPS. Everything else
//   the pattern claims follows from that one property.
//
// If you remember the common bug:
//   A view that takes the API's wire shape as props. The backend migration
//   then touches every component instead of one.
//
// If you remember the professional framing:
//   Keep the seam, question the second component. Hooks moved the container
//   inside the view, and Server Components moved it onto the network — the
//   separation is more real now than it ever was in 2015, and it costs one
//   fewer file.
//
// NEXT TOPIC -> 05_provider-pattern.js
