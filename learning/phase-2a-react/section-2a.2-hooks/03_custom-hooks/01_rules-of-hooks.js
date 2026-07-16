// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  01_rules-of-hooks.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Rules of Hooks
//
// WHAT YOU WILL MASTER HERE:
//   1. Both rules, and the ONE fact they both come from
//   2. "Rendered fewer hooks than expected" — reproduced with the real error
//   3. The early-return trap (the most common real violation)
//   4. Rule 2: how React ENFORCES "only in components" — the dispatcher
//   5. Why a loop breaks it, and what to do instead
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/01_rules-of-hooks.js"
//
// Prerequisite: 02_built-in-hooks/01_usestate-internals.js — you built the
// array. This file is the consequences of that array.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Rules of Hooks:
//   1. Only call hooks at the TOP LEVEL — never in conditions, loops, nested
//      functions, or after an early return.
//   2. Only call hooks from React FUNCTION COMPONENTS or from other CUSTOM
//      HOOKS — never from plain functions, classes, or event handlers.
//
// If interviewer says "explain it simply", say:
// "React identifies hooks by the ORDER they are called, not by name. So the
//  same hooks must run in the same order on every render. That is rule one.
//  Rule two is that React must know which component is rendering, and it only
//  knows that inside a render."
//
// If interviewer asks "why does it matter?", say:
// "They are not style guidelines — they are load-bearing. Break rule one and
//  your useState reads another hook's slot. I can show you the state variable
//  becoming a string."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   call order IS the identity
//
// The single fact both rules come from:
//
//   React stores hooks in a list on the fiber, and looks them up by POSITION.
//   There is no name. There is no key. Slot 0, slot 1, slot 2.
//
//   render #1              render #2
//   ─────────              ─────────
//   useState  → slot 0     useState  → slot 0   ← must be the SAME hook
//   useEffect → slot 1     useEffect → slot 1
//   useRef    → slot 2     useRef    → slot 2
//
// Rule 1 falls out immediately: anything that changes WHICH hooks run, or in
// what order, misaligns every slot after it.
//
// Rule 2 is different, and people rarely explain it correctly:
//   React swaps an internal DISPATCHER object before and after each render.
//   Outside a render, the dispatcher is null (or a warning stub), so React
//   literally cannot know which fiber your useState belongs to. It is not a
//   convention — there is no fiber to attach to.
//
// Runtime rule:
//   The lint rule is not being pedantic. It is the only thing catching this
//   before production, because React only errors on the SPECIFIC render where
//   the count changes.
//
// Practical rule:
//   All hooks first. Then your guards. Then your JSX.
//
// Common trap:
//   `if (!user) return null;` placed above a useState. It looks like clean
//   defensive code. It is a hook-order bomb.


// ══════════════════════════════════════════════════════════════════
// § 3 — A MINI REACT THAT ENFORCES THE RULES
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renderCount = 0;
  let hookCountLastRender = null;

  // ── RULE 2's ENFORCEMENT MECHANISM ──────────────────────────────
  // React swaps this in during render and nulls it out afterwards. Calling a
  // hook outside a render finds `null` and throws. There is no fiber to
  // attach to — the error is structural, not a policy.
  let dispatcher = null;

  function resolveDispatcher() {
    if (dispatcher === null) {
      throw new Error(
        "Invalid hook call. Hooks can only be called inside of the body of a " +
        "function component."
      );
    }
    return dispatcher;
  }

  const realDispatcher = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in hooks)) hooks[slot] = { type: "state", value: initial };
      const setState = (v) => { hooks[slot].value = v; };
      return [hooks[slot].value, setState];
    },
    useEffect(fn, deps) {
      const slot = cursor++;
      if (!(slot in hooks)) hooks[slot] = { type: "effect", deps, fn };
      return undefined;
    },
  };

  const useState = (initial) => resolveDispatcher().useState(initial);
  const useEffect = (fn, deps) => resolveDispatcher().useEffect(fn, deps);

  function render() {
    cursor = 0;
    renderCount++;
    dispatcher = realDispatcher;          // ← rule 2: hooks now legal
    let output;
    try {
      output = component();
    } finally {
      dispatcher = null;                  // ← rule 2: hooks now illegal again
    }

    // ── RULE 1's ENFORCEMENT ──────────────────────────────────────
    // React counts the hooks. A different count than last render = the slots
    // have shifted = throw.
    if (hookCountLastRender !== null && cursor !== hookCountLastRender) {
      const message = cursor < hookCountLastRender
        ? `Rendered fewer hooks than expected. This may be caused by an ` +
          `accidental early return statement.`
        : `Rendered more hooks than during the previous render.`;
      throw new Error(message);
    }
    hookCountLastRender = cursor;
    return output;
  }

  function mount(fn) { component = fn; return render(); }

  return {
    useState, useEffect, mount, render,
    getHooks: () => hooks.slice(),
    getRenderCount: () => renderCount,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — RULE 1: THE SLOTS SHIFT
// ══════════════════════════════════════════════════════════════════
//
// The proof. Not "React will complain" — watch a number become a string.

console.log("§4 — a conditional hook, and what it does to your state:\n");

const R1 = createMiniReact();
let showBanner = true;

R1.mount(() => {
  if (showBanner) {
    R1.useState("Welcome!");        // slot 0 — only SOMETIMES
  }
  const [count] = R1.useState(0);   // slot 1 on render #1... slot 0 on #2
  return count;
});

console.log("  render #1 (showBanner=true):");
console.log("    hooks:", JSON.stringify(R1.getHooks().map(h => h.value)));
console.log("    count =", 0, "← correct");

showBanner = false;
try {
  R1.render();
} catch (e) {
  console.log("\n  render #2 (showBanner=false):");
  console.log("    💥", e.message);
}

console.log("\n  And if React did NOT throw, here is what you would get:\n");

// The same thing without the guard, so we can SEE the corruption:
function unguardedDemo() {
  const hooks = [];
  let cursor = 0;
  let show = true;

  const useState = (initial) => {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = initial;
    return [hooks[slot]];
  };

  const Component = () => {
    cursor = 0;
    if (show) useState("Welcome!");
    const [count] = useState(0);
    return count;
  };

  const first = Component();
  show = false;
  const second = Component();
  return { first, second, hooks };
}

const { first, second } = unguardedDemo();
console.log("    render #1 → count =", JSON.stringify(first), `(${typeof first})`);
console.log("    render #2 → count =", JSON.stringify(second), `(${typeof second})`);
console.log("\n  🐛 `count` is now the STRING 'Welcome!'. Your counter is a");
console.log("     banner message. count + 1 is 'Welcome!1'. This is why React");
console.log("     throws instead of letting you continue — silent slot");
console.log("     corruption is far worse than a crash.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE EARLY RETURN (the one you will actually ship)
// ══════════════════════════════════════════════════════════════════
//
// Nobody writes `if (x) useState()`. Everyone writes this:

console.log("§5 — the early return trap:\n");

const R2 = createMiniReact();
let user = null;

// ❌ BROKEN — the guard is above a hook
R2.mount(() => {
  const [theme] = R2.useState("dark");     // slot 0 — always runs
  if (!user) return null;                  // ← 🐛 on render #1, we stop HERE
  const [name] = R2.useState(user.name);   // slot 1 — SKIPPED on render #1
  return { theme, name };
});

console.log("  const [theme] = useState('dark');");
console.log("  if (!user) return null;          // ← the guard");
console.log("  const [name] = useState(user.name);");
console.log("\n  render #1 (user is null)  → 1 hook ran, then returned early");

user = { name: "Vineet" };
try {
  R2.render();
  console.log("  render #2 (user loaded)   → no error?!");
} catch (e) {
  console.log("  render #2 (user loaded)   → 💥", e.message);
}

console.log("\n  Note the ORDER of failure: render #1 is fine. The crash comes");
console.log("  on render #2, when the data arrives — so it works in dev with");
console.log("  cached data and explodes for a real user on a cold load.");

console.log("\n  ✅ THE FIX — all hooks first, guards after:\n");
console.log("     const [theme] = useState('dark');");
console.log("     const [name] = useState(user?.name ?? '');   // ← always runs");
console.log("     if (!user) return null;                      // ← now safe");

const R3 = createMiniReact();
let user3 = null;
R3.mount(() => {
  const [theme] = R3.useState("dark");
  const [name] = R3.useState(user3?.name ?? "");   // ← unconditional
  if (!user3) return null;                          // ← guard AFTER
  return { theme, name };
});
user3 = { name: "Vineet" };
R3.render();
console.log("\n     render #1 (null) → ok, render #2 (loaded) → ok ✅");
console.log("     Both renders ran 2 hooks. The slots never moved.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — RULE 2: HOW REACT ENFORCES IT
// ══════════════════════════════════════════════════════════════════
//
// "Only call hooks from components or custom hooks."
//
// This is not a style rule. React swaps a DISPATCHER before and after each
// render. Outside a render it is null, so the hook has no fiber to attach to.

console.log("§6 — calling a hook outside a render:\n");

const R4 = createMiniReact();

// From a plain function:
try {
  R4.useState(0);
} catch (e) {
  console.log("  from a plain function →");
  console.log("    💥", e.message.slice(0, 60) + "...");
}

// From an event handler — the same thing, and a very common instinct:
const handleClick = () => {
  try {
    R4.useState(0);
    return "worked";
  } catch (e) {
    return "💥 " + e.message.slice(0, 44) + "...";
  }
};
console.log("\n  from an event handler →");
console.log("   ", handleClick());
console.log("    (people try this when they want state 'only on click'.");
console.log("     The hook must be at the top level; the HANDLER calls the");
console.log("     setter it returned.)");

// Inside a render, the same call works:
const R5 = createMiniReact();
let insideResult;
R5.mount(() => {
  const [value] = R5.useState("legal here");
  insideResult = value;
  return value;
});
console.log("\n  from inside a component render →");
console.log("    ✅", JSON.stringify(insideResult));

console.log("\n  Same function, same argument, opposite outcome. The only");
console.log("  difference is whether React had swapped the dispatcher in.");
console.log("  That is why the error says 'Invalid hook call' and not");
console.log("  'please follow our conventions'.\n");

// The famous third cause of this error:
console.log("  The error also has a notorious THIRD cause: two copies of");
console.log("  React in node_modules. Your component uses copy A's dispatcher;");
console.log("  the hook is imported from copy B, whose dispatcher is null.");
console.log("  Identical symptom, completely different fix (npm dedupe, or");
console.log("  peerDependencies). Worth naming — it wastes hours.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — LOOPS, AND WHAT TO DO INSTEAD
// ══════════════════════════════════════════════════════════════════
//
// "I need a useState per item in this array."

console.log("§7 — hooks in a loop:\n");

const R6 = createMiniReact();
let items = ["a", "b"];

R6.mount(() => {
  // ❌ the hook count depends on DATA
  for (const item of items) R6.useState(item);
  return items.length;
});
console.log("  for (const item of items) useState(item);");
console.log("    render #1 with 2 items → 2 hooks");

items = ["a", "b", "c"];
try {
  R6.render();
} catch (e) {
  console.log("    render #2 with 3 items → 💥", e.message);
}

console.log("\n  The hook count is now a function of your DATA. Every array");
console.log("  change reshuffles the slots. There is no way to make this work.");

console.log("\n  ✅ THE FIXES:\n");
console.log("    1. ONE state holding all of them:");
console.log("         const [values, setValues] = useState({});");
console.log("         setValues(v => ({ ...v, [id]: newValue }));");
console.log("\n    2. Extract a COMPONENT — the idiomatic answer:");
console.log("         {items.map(item => <Row key={item.id} item={item} />)}");
console.log("       Each <Row/> is its own fiber with its own hook list, so");
console.log("       each one can call useState at ITS top level, legally.");
console.log("       This is why 'lift it into a component' is the standard");
console.log("       answer to almost every hooks-in-a-loop question.");
console.log("\n    3. useReducer if the items must change together.");
console.log("       → 02_built-in-hooks/06_usereducer-vs-usestate.js\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHY CUSTOM HOOKS ARE EXEMPT
// ══════════════════════════════════════════════════════════════════
//
// A custom hook is just a function that calls hooks. It has NO fiber and NO
// hook list of its own — it borrows the CALLER's.
//
//   function Component() {
//     const [a] = useState(1);       // slot 0
//     const width = useWindowSize();  // ← calls useState + useEffect inside
//     const [b] = useState(2);       // slot 3 (!), not slot 1
//   }
//
//   function useWindowSize() {
//     const [size, setSize] = useState(0);   // ← slot 1 of the COMPONENT
//     useEffect(() => {}, []);               // ← slot 2 of the COMPONENT
//     return size;
//   }
//
// This is why:
//   • the rules apply INSIDE custom hooks too — they occupy the caller's slots
//   • two components using the same custom hook do NOT share state; each has
//     its own fiber, so useWindowSize() gives each one its own slots
//   • the `use` prefix is not decoration — the LINT RULE keys off it to know
//     a function may contain hooks
//
// That last point is worth saying: the naming convention is load-bearing for
// tooling, not for React itself. React cannot tell a custom hook from a
// plain function — only the linter can, and only via the name.

console.log("§8 — a custom hook borrows the caller's slots:\n");

const R7 = createMiniReact();

function useCounter(start) {           // a custom hook — no fiber of its own
  const [count, setCount] = R7.useState(start);
  R7.useEffect(() => {}, []);
  return [count, setCount];
}

R7.mount(() => {
  const [theme] = R7.useState("dark");       // slot 0
  const [count] = useCounter(10);            // slots 1 (state) + 2 (effect)
  const [lang] = R7.useState("en");          // slot 3
  return { theme, count, lang };
});

console.log("  const [theme] = useState('dark');   // slot 0");
console.log("  const [count] = useCounter(10);     // slots 1 + 2 (inside the hook)");
console.log("  const [lang]  = useState('en');     // slot 3");
console.log("\n  the component's actual hook list:");
R7.getHooks().forEach((h, i) => {
  console.log(`    slot ${i}: ${h.type}${h.value !== undefined ? " = " + JSON.stringify(h.value) : ""}`);
});
console.log("\n  useCounter has no hook list of its own. Its useState landed in");
console.log("  the COMPONENT's slot 1. That is why the rules apply inside custom");
console.log("  hooks too — and why two components calling useCounter() get");
console.log("  separate state: separate fibers, separate lists.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   an array + cursor         a linked list of hook objects on the fiber
//   count the hooks           the same idea — dev-only, it compares the hook
//                             count and throws with that exact message
//   dispatcher = null         a real dispatcher swap:
//                             HooksDispatcherOnMount / OnUpdate / InDEV, and
//                             ContextOnlyDispatcher outside render, which is
//                             what actually throws "Invalid hook call"
//   n/a                       eslint-plugin-react-hooks statically detects
//                             violations — it is the ONLY thing that catches
//                             them before runtime
//   n/a                       React Compiler REQUIRES these rules and silently
//                             bails out on components that break them
//   n/a                       React 19's use() is the FIRST exception: it CAN
//                             be called conditionally
//
// The use() exception deserves a sentence, because it sounds like a
// contradiction:
//   use() reads a promise or context and can be called in an if. It works
//   because it does not need a persistent slot — it does not store state
//   across renders, it suspends. Hooks that remember need slots; use() does
//   not remember. That is the whole reason it is allowed to break rule 1.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Rendered fewer hooks than expected":
//   An early return above a hook. → §5. The most common real violation.
//
// Bug 2 — "Rendered more hooks than during the previous render":
//   A conditional hook that started running. → §4.
//
// Bug 3 — A state variable holds the wrong TYPE:
//   Slot corruption, if React did not throw. → §4.
//
// Bug 4 — "Invalid hook call":
//   Called outside a render — a plain function, a handler, a class. → §6.
//
// Bug 5 — "Invalid hook call" with correct-looking code:
//   TWO COPIES OF REACT. → §6. Different fix entirely.
//
// Bug 6 — Hooks in a loop over data:
//   The count follows the array length. → §7. Extract a component.
//
// Bug 7 — Disabling the lint rule to ship:
//   The rule is the only pre-runtime check you have.
//
// Bug 8 — Hooks after a try/catch or an && short-circuit:
//   Same class. Anything that can skip a hook call.
//
// Bug 9 — React Compiler silently not optimizing a component:
//   It bails out on rule violations. Your app works, and gets no benefit.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Rule 1 throws:
let rule1Error = null;
const A = createMiniReact();
let cond = true;
A.mount(() => { if (cond) A.useState("x"); A.useState(0); return null; });
cond = false;
try { A.render(); } catch (e) { rule1Error = e.message; }
assert(rule1Error !== null, "a conditional hook throws on the render where the count changes");
assert(rule1Error.includes("fewer hooks"), "...with React's actual error message");

// The corruption underneath — the real reason for the rule:
assert(first === 0, "render #1: count is the number 0");
assert(second === "Welcome!",
  "render #2: count is the STRING 'Welcome!' — it read the banner's slot 🐛");
assert(typeof first !== typeof second,
  "the SAME variable changed TYPE across renders. That is what React prevents.");

// The early return:
let earlyError = null;
const B = createMiniReact();
let u = null;
B.mount(() => { B.useState("dark"); if (!u) return null; B.useState(u.name); return null; });
u = { name: "x" };
try { B.render(); } catch (e) { earlyError = e.message; }
assert(earlyError !== null, "the early return crashes when the data ARRIVES, not before");

// The fix works:
assert(R3.getRenderCount() === 2, "hooks-first version rendered twice, no error");
assert(R3.getHooks().length === 2, "both renders ran exactly 2 hooks — slots stable");

// Rule 2 — the dispatcher:
let rule2Error = null;
try { createMiniReact().useState(0); } catch (e) { rule2Error = e.message; }
assert(rule2Error.includes("Invalid hook call"),
  "outside a render, the dispatcher is null → Invalid hook call");
assert(insideResult === "legal here",
  "the SAME call inside a render works — the only difference is the dispatcher");

// Custom hooks borrow the caller's slots:
const hooks7 = R7.getHooks();
assert(hooks7.length === 4, "1 + (1 state + 1 effect from the custom hook) + 1 = 4 slots");
assert(hooks7[1].type === "state" && hooks7[1].value === 10,
  "useCounter's useState occupies the COMPONENT's slot 1 — it has no list of its own");
assert(hooks7[3].value === "en",
  "the useState AFTER the custom hook is at slot 3, not slot 1");

console.log("§11 — mini assertions passed for: Rules of Hooks");
console.log("\n  The assertion that explains everything: `typeof first !==");
console.log("  typeof second`. A number became a string, in the same variable,");
console.log("  across two renders. THAT is what the rules prevent.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are the Rules of Hooks and why?", answer like this:
//
//   "Two rules: only at the top level, and only from components or custom
//    hooks. Both come from one fact — React stores hooks in a list on the
//    fiber and looks them up by POSITION. There's no name and no key. Slot 0,
//    slot 1, slot 2.
//
//    So rule one is a direct consequence. Put a useState in an if, and when
//    the condition flips, every slot after it shifts by one. Your count reads
//    the banner's slot and becomes the string 'Welcome!' — a number silently
//    becomes a string. React counts the hooks and throws 'rendered fewer hooks
//    than expected' precisely because silent slot corruption is much worse
//    than a crash.
//
//    In practice nobody writes if (x) useState(). What people write is a guard
//    — if (!user) return null — above a hook. And the nasty part is the timing:
//    render one is fine, and it crashes on render two when the data arrives.
//    So it works in dev with cached data and explodes on a cold load. The fix
//    is all hooks first, then guards.
//
//    Rule two is different and people usually explain it as a convention. It
//    isn't — React swaps an internal dispatcher before and after each render.
//    Outside a render it's a stub that throws, because there's literally no
//    fiber to attach the state to. That error also has a notorious third
//    cause: two copies of React, where your component uses one dispatcher and
//    the hook is imported from another.
//
//    Custom hooks are exempt from having their own list — they borrow the
//    caller's slots. That's why the rules apply inside them, and why two
//    components using the same custom hook don't share state. And the `use`
//    prefix is load-bearing for the LINTER, not React — React can't tell a
//    custom hook from a plain function; only the name tells the linter.
//
//    One modern exception: React 19's use() can be called conditionally,
//    because it doesn't need a persistent slot — it doesn't remember anything
//    across renders."
//
// The type-corruption demo and the dispatcher explanation are the senior
// markers. Most candidates say "React needs consistent order" and stop.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why must hooks be called in the same order?
// A1. React identifies them by position in the fiber's hook list. Order is
//     the identity — there is no name.
//
// Q2. What actually happens if you break it?
// A2. The slots shift. A hook reads another hook's value — a number becomes a
//     string. React throws to prevent that silent corruption.
//
// Q3. Why does the early return crash on render TWO?
// A3. Render one establishes the hook count. The crash comes when the guard
//     stops short-circuiting — i.e. when the data arrives.
//
// Q4. How does React enforce rule 2?
// A4. It swaps a dispatcher per render. Outside a render, the dispatcher
//     throws — there is no fiber to attach state to.
//
// Q5. Why does "Invalid hook call" appear with correct code?
// A5. Two copies of React. Your component and the hook resolve different
//     dispatchers. Fix with dedupe/peerDependencies, not with code changes.
//
// Q6. Why are custom hooks allowed to call hooks?
// A6. They have no fiber. They occupy the CALLER's slots, so the caller's
//     order stays deterministic.
//
// Q7. Do two components sharing a custom hook share state?
// A7. No. Each has its own fiber and its own hook list.
//
// Q8. What if you need a hook per array item?
// A8. One state object, or extract a component so each item gets its own fiber.
//
// Q9. Is the `use` prefix required by React?
// A9. No — React cannot tell. It is required by the lint rule, which is the
//     only thing that catches violations statically.
//
// Q10. Does React 19's use() break the rules?
// A10. It is an exception to rule 1 — it can be conditional, because it does
//      not store anything across renders, so it needs no slot.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What are the two rules?
//   Back : Top level only. Components/custom hooks only.
//
// Flashcard 2:
//   Front: Why?
//   Back : Hooks are matched by POSITION in the fiber's list. Order is identity.
//
// Flashcard 3:
//   Front: What is the most common real violation?
//   Back : An early return above a hook. It crashes when the data ARRIVES.
//
// Flashcard 4:
//   Front: What happens if the slots shift?
//   Back : A hook reads another's value. A number becomes a string.
//
// Flashcard 5:
//   Front: How is rule 2 enforced?
//   Back : A dispatcher swapped per render. Null outside → Invalid hook call.
//
// Flashcard 6:
//   Front: "Invalid hook call" with correct code?
//   Back : Two copies of React.
//
// Flashcard 7:
//   Front: Need a hook per item?
//   Back : Extract a component. Each fiber gets its own list.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : Show the type corruption, and explain the dispatcher — not "React
//          needs consistent order."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the dispatcher swap from memory. Three lines, and it is the whole
//   of rule 2.
//
// Task 2:
//   Add the hook-count check to your own mini React and reproduce both of
//   React's messages — fewer AND more.
//
// Task 3:
//   Fix §7 with the extract-a-component approach in the mini React: give each
//   item its own hooks array. You have just discovered why fibers exist.
//
// Task 4:
//   Write a component with a hook after a try/catch that can throw. Does it
//   violate the rules? Reason it through before testing.
//
// Task 5:
//   Implement use(): callable conditionally because it stores nothing. Then
//   articulate exactly why that makes it safe when useState would not be.
//
// Task 6:
//   Explain in 60 seconds why `if (!user) return null` above a useState works
//   perfectly in dev and crashes in production.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Call order IS the identity. Both rules fall out of positional lookup.
//
// If you remember the common bug:
//   An early return above a hook. Fine on render #1, crashes when the data
//   arrives on render #2.
//
// If you remember the professional framing:
//   Rule 2 is a dispatcher, not a convention. Custom hooks borrow the
//   caller's slots. The `use` prefix is for the linter, not for React.
//
// NEXT TOPIC -> 02_usefetch-custom-hook.js
