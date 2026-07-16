// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ State Patterns — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.3 — State Management.
// This is the last section of Phase 2A.
//
// Folder:
//   learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/
//
// Files:
// ├── index.js
// ├── 01_lifting-state-up.js
// ├── 02_prop-drilling-problem.js
// ├── 03_context-api-provider-pattern.js
// ├── 04_redux-toolkit-createslice.js
// ├── 05_redux-actions-reducers-store.js
// ├── 06_redux-thunk-middleware.js
// ├── 07_redux-saga-concepts.js
// ├── 08_zustand-basics.js
// ├── 09_jotai-recoil-atoms.js
// ├── 10_react-query-usequery-usemutation.js
// ├── 11_optimistic-updates.js
// ├── 12_derived-state.js
// ├── 13_immutable-state-updates.js
// ├── 14_immer-library.js
// ├── 15_state-machines-xstate-intro.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// READ IN ORDER:
//   This section is an ARGUMENT, not a catalogue. 01 creates the problem
//   that 02 refines, that 03 half-solves, that 04-09 solve differently, and
//   that 10 dissolves. Reading 08 first will teach you Zustand's API and
//   none of the reasoning.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Lifting state up — the closest common ancestor. As low as possible.
// 02. Prop drilling — the cost is COUPLING, not performance. Compose instead.
// 03. Context API + Provider — dependency injection. No selectors, ever.
// 04. Redux Toolkit createSlice — write the reducer, get the rest generated.
// 05. Redux actions/reducers/store — state = reducer(state, action).
// 06. Redux Thunk — five lines. And it cannot cancel.
// 07. Redux Saga — yield a DESCRIPTION. Best tests in Redux, poor TypeScript.
// 08. Zustand — a store outside React + selectors. 21 renders → 1.
// 09. Jotai / Recoil — bottom-up atoms. Recoil is archived (Jan 2025).
// 10. React Query — server state is a CACHE, not state.
// 11. Optimistic updates — cancel, snapshot, apply, settle.
// 12. Derived state — if you can compute it, do not store it.
// 13. Immutable updates — React compares REFERENCES. That is the whole reason.
// 14. Immer — mutate a draft Proxy, get a new object. It shares better than you.
// 15. State machines — a reducer kills impossible STATES; a machine kills
//     impossible TRANSITIONS too.

const topics = [
  "Lifting state up",
  "Prop drilling problem",
  "Context API + Provider pattern",
  "Redux Toolkit — createSlice",
  "Redux — actions, reducers, store",
  "Redux Thunk middleware",
  "Redux Saga (concepts)",
  "Zustand basics",
  "Jotai / Recoil (atoms)",
  "React Query — useQuery, useMutation",
  "Optimistic updates",
  "Derived state",
  "Immutable state updates",
  "Immer library",
  "State machines (XState intro)",
];

console.log("State Patterns topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01  two components need one value → lift it to the common ancestor
//        ...and now everything below re-renders. 9 renders vs 3.
//
//   02  ...and the intermediates are coupled to data they never read
//        → composition kills most of it, with no library at all
//
//   03  → Context! ...which fixes the PLUMBING, not the re-renders.
//        21 consumers re-render for one change. There are no selectors.
//
//   04-07 → Redux. Real selectors, real devtools, real conventions —
//        and real ceremony. Thunk cannot cancel; saga can, at 14kB.
//
//   08-09 → Zustand (1kB + selectors) and Jotai (compose up, no selectors
//        to get wrong). Both are smaller answers to Context's real gap.
//
//   10  → and then: most of what you put in that store was SERVER DATA.
//        It is a cache, not state. Move it to React Query and audit what
//        is left. Usually: a theme, a modal, and a form draft.
//
//   11-15 → the mechanics you need whatever you chose: optimistic updates,
//        deriving instead of storing, immutability, Immer, and machines.
//
// THE PUNCHLINE:
//   The whole debate about state libraries is mostly a debate about server
//   data. Remove it first. What remains rarely needs any of them.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — CLIMB IN ORDER
// ══════════════════════════════════════════════════════════════════
//
//   0. Is it SERVER DATA?           → React Query. Stop. (10)
//   1. Can you compute it?          → derive it. It is not state. (12)
//   2. Two or three levels?         → just pass the prop. (02)
//   3. Structural intermediates?    → composition — pass the ELEMENT. (02)
//   4. Ambient + changes rarely?    → Context. (03)
//   5. Many consumers + changes often, or you want selectors?
//                                   → Zustand (08) or Jotai (09)
//   6. Big team, complex domain, audit trail?
//                                   → RTK. The conventions pay for themselves. (04)
//   7. Does the ORDER matter and mistakes cost money?
//                                   → a state machine. (15)
//
// Most teams jump to rung 6 from rung 2. Most rung-6 problems are rung-0
// problems.

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS SECTION PROVES
// ══════════════════════════════════════════════════════════════════
//
//   lifting to the root vs the right level    9 renders  vs 3     (01)
//   drilling vs composition                   4 coupled  vs 1     (02)
//   combined context vs split                 21 renders vs 1     (03)
//   context vs a store with selectors         3 renders  vs 1     (03)
//   Context vs Zustand, same app              21 renders vs 1     (08)
//   3 components, 1 queryKey                  3 requests vs 1     (10)
//   4 booleans                                16 states, 4 legal  (15)
//   deep-compare 10k items vs Object.is       30,002 vs 1         (13)
//
// None of those are quoted. Every one is produced by code in the file.

// ══════════════════════════════════════════════════════════════════
// THE FOUR TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. Object.is IS THE ONLY COMPARISON
//    Immutability (13), Immer's sharing (14), memo, deps, selectors (08),
//    getSnapshot (14 in hooks) — all one rule. An object literal anywhere in
//    that machinery means "always changed".
//
// 2. TWO SOURCES OF TRUTH ALWAYS DESYNC
//    Not lifting (01). Storing derived state (12). Copying query.data into
//    useState (10). Mirroring a prop with an effect (01, 12). Same bug,
//    four costumes.
//
// 3. AN EFFECT THAT SYNCS STATE IS A SMELL
//    It commits a WRONG FRAME first, then corrects it. Derive during render,
//    or use a key. (12, and 03_custom-hooks/07)
//
// 4. MAKE IMPOSSIBLE STATES UNREPRESENTABLE
//    useReducer (built-in hooks 06) → one status field.
//    React Query → one status, not three booleans.
//    State machines (15) → impossible TRANSITIONS too.
//    useOptimistic (11) → derive a layer, so rollback bugs cannot exist.
//    The best fix is never "remember to handle it". It is "you cannot write it".

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// ─────────────────────────────────────────────────────────────────
// END OF PHASE 2A, SECTION 2A.3 — and of the docx's 2A.3 scope.
//
// Still ahead in the docx, if you continue:
//   2A.4 Performance — React.memo, code splitting, virtualization, Web Vitals
//   2A.5 Patterns & Architecture — compound components, render props, HOCs,
//        portals, error boundaries, React Router v6
// ─────────────────────────────────────────────────────────────────
