// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  09_component-types-class-vs-func.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Component types (class vs func)
//
// WHAT YOU WILL MASTER HERE:
//   1. How React TELLS them apart (it is not typeof — the real mechanism)
//   2. The lifecycle → hooks translation table
//   3. Why class `this.props` breaks in async code — PROVEN side by side
//   4. What classes still do that hooks cannot
//   5. Real bugs and migration traps
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/09_component-types-class-vs-func.js"
//
// Prerequisite: 03_this-keyword/ from Phase 1 — the capture-vs-lookup
// distinction in §5 IS the `this` binding topic, wearing a React hat.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Component types:
// Both are just functions React calls to get elements. A class component is
// instantiated with `new` and keeps a long-lived instance; a function
// component is called fresh every render and keeps nothing.
//
// If interviewer says "explain it simply", say:
// "A class has one instance that persists across renders and mutates itself.
//  A function runs from scratch every render and closes over that render's
//  values. Same output, opposite relationship with time."
//
// If interviewer asks "why does it matter?", say:
// "Because it explains both models' signature bugs. Classes read `this.props`
//  at CALL time, so async callbacks see the newest props. Functions capture
//  props at RENDER time, so async callbacks see stale ones. Neither is a bug
//  in the framework — they are the two halves of the same trade-off."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   instance that mutates  vs  closure that freezes
//
// The pictures:
//
//   CLASS                            FUNCTION
//   ─────                            ────────
//   new Counter(props)  ← once       Counter(props)  ← every render
//        │                                │
//   instance lives on                 returns, dies
//        │                                │
//   render() called N times           called N times, each with its OWN
//   reading the CURRENT this.props    frozen copy of props and state
//
// Runtime rule:
//   this.props is a LOOKUP — resolved when the line runs.
//   props in a function is a BINDING — captured when the render ran.
//
// Practical rule:
//   Function components are the default in 2026. Classes appear in legacy
//   code and in exactly one place new code still needs them. → §7
//
// Common trap:
//   Believing hooks were added for "less code". They were added because
//   lifecycle methods split ONE concern across three methods, and mixed
//   THREE concerns into one method. Hooks group by concern, not by timing.


// ══════════════════════════════════════════════════════════════════
// § 3 — HOW REACT TELLS THEM APART
// ══════════════════════════════════════════════════════════════════
//
// Interviewers love this one because the obvious answer is wrong.
//
// typeof both === "function". A class IS a function. So React cannot use
// typeof, and it does NOT parse your code or check the name's case (that is
// the COMPILER's job at the JSX level — different question, see file 01).
//
// React checks ONE thing:
//
//   Component.prototype && Component.prototype.isReactComponent
//
// React.Component's prototype carries an `isReactComponent` marker. Extend
// it and your class inherits the flag. That is the entire detection.

console.log("§3 — how React detects a class component:\n");

// A minimal React.Component:
class ReactComponent {
  constructor(props) {
    this.props = props;
    this.state = {};
  }
  setState(partial) {
    this.state = { ...this.state, ...(typeof partial === "function"
      ? partial(this.state, this.props) : partial) };
  }
}
ReactComponent.prototype.isReactComponent = {};   // ← the marker. Literally this.

class ClassGreeting extends ReactComponent {
  render() { return `Hello ${this.props.name}`; }
}

function FuncGreeting(props) {
  return `Hello ${props.name}`;
}

console.log("  typeof ClassGreeting :", typeof ClassGreeting);
console.log("  typeof FuncGreeting  :", typeof FuncGreeting);
console.log("  → typeof is useless. Both are functions.\n");

function isClassComponent(Component) {
  return !!(Component.prototype && Component.prototype.isReactComponent);
}

console.log("  isReactComponent on ClassGreeting?", isClassComponent(ClassGreeting));
console.log("  isReactComponent on FuncGreeting? ", isClassComponent(FuncGreeting));

// And that flag decides HOW React calls it:
function renderComponent(Component, props) {
  if (isClassComponent(Component)) {
    const instance = new Component(props);      // ← new. Instance persists.
    return instance.render();
  }
  return Component(props);                      // ← plain call. Nothing persists.
}

console.log("\n  render(ClassGreeting):", renderComponent(ClassGreeting, { name: "Vineet" }));
console.log("  render(FuncGreeting) :", renderComponent(FuncGreeting, { name: "Vineet" }));
console.log("\n  Why it matters: calling a class WITHOUT new throws in ES6");
console.log("  ('Class constructor cannot be invoked without new'). React must");
console.log("  know before it calls. Hence the flag, not typeof.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LIFECYCLE → HOOKS TABLE
// ══════════════════════════════════════════════════════════════════
//
//   Class                          Function equivalent
//   ─────                          ───────────────────
//   constructor                    useState(initial)
//   componentDidMount              useEffect(fn, [])
//   componentDidUpdate             useEffect(fn, [deps])
//   componentWillUnmount           the CLEANUP returned from useEffect
//   shouldComponentUpdate          React.memo(Component, areEqual)
//   getDerivedStateFromProps       compute during render, or key={}
//   getSnapshotBeforeUpdate        useLayoutEffect
//   componentDidCatch              NO HOOK EXISTS. → §7
//   getDerivedStateFromError       NO HOOK EXISTS. → §7
//   this.forceUpdate()             useReducer(x => x + 1, 0) — the escape hatch
//
// The important nuance — this is NOT a 1:1 mapping:
//
//   useEffect(fn, [])  ≠  componentDidMount
//
//     • componentDidMount fires BEFORE paint (it is synchronous in commit).
//       useEffect fires AFTER paint. useLayoutEffect is the true equivalent.
//     • In StrictMode dev, useEffect(fn, []) runs mount→unmount→mount.
//       componentDidMount does not double-fire that way.
//
//   ONE useEffect  ≠  ONE lifecycle method
//
//     This is the actual argument for hooks. A subscription is ONE concern
//     split across componentDidMount + componentDidUpdate + componentWillUnmount.
//     A single useEffect with a cleanup holds all three. Meanwhile ONE
//     componentDidMount mixed a data fetch, an event listener, and an
//     analytics ping — three concerns in one method.
//
//     Hooks group by CONCERN. Lifecycles grouped by TIMING.
//     That sentence is the whole answer to "why hooks?"


// ══════════════════════════════════════════════════════════════════
// § 5 — THE SIGNATURE DIFFERENCE: this.props vs captured props
// ══════════════════════════════════════════════════════════════════
//
// Dan Abramov's classic example. Both components show a profile and, after
// a 3-second delay, alert the name. The user switches profiles during those
// 3 seconds. What gets alerted?

console.log("§5 — the async trap, both models:\n");

const alerts = [];

// ── CLASS ────────────────────────────────────────────────────────
class ProfileClass extends ReactComponent {
  showLater() {
    // `this.props` is resolved WHEN THIS LINE RUNS, 3 seconds from now.
    // By then the instance's props have been REPLACED by React.
    setTimeout(() => alerts.push(`class → ${this.props.user}`), 0);
  }
}

// ── FUNCTION ─────────────────────────────────────────────────────
function ProfileFunction(props) {
  function showLater() {
    // `props` was CAPTURED by this render's closure. It cannot change.
    setTimeout(() => alerts.push(`function → ${props.user}`), 0);
  }
  return { showLater };
}

// Render both with "Vineet", click the button:
const classInstance = new ProfileClass({ user: "Vineet" });
const funcRender = ProfileFunction({ user: "Vineet" });

classInstance.showLater();
funcRender.showLater();

// The user navigates to another profile BEFORE the timeout fires.
// React mutates the class instance's props in place:
classInstance.props = { user: "Ankit" };
// The function component just re-renders — the OLD closure is untouched:
const funcRender2 = ProfileFunction({ user: "Ankit" });

setTimeout(() => {
  console.log("  clicked while viewing 'Vineet', then navigated to 'Ankit':");
  for (const line of alerts) console.log("   ", line);
  console.log("\n  class    → 'Ankit'  🐛 the WRONG name. The user clicked on");
  console.log("                        Vineet's profile. this.props was read at");
  console.log("                        call time, and React had already");
  console.log("                        overwritten it on the instance.");
  console.log("  function → 'Vineet' ✅ correct. props was captured by the");
  console.log("                        closure of the render the user clicked on.");
  console.log("\n  This is why function components are the default. They are");
  console.log("  CONSISTENT WITH THE RENDER THE USER SAW.");
  console.log("\n  And the mirror image — the same mechanism inverted:");
  console.log("    A setInterval in useEffect(fn, []) captures render #1's state");
  console.log("    FOREVER and always logs 0. In a class, this.state.count would");
  console.log("    have been correct. The stale closure is the PRICE of the fix.");
  console.log("    → 02_built-in-hooks/01_usestate-internals.js §5\n");
  runComparison();
}, 10);


// ══════════════════════════════════════════════════════════════════
// § 6 — SETSTATE: MERGE vs REPLACE
// ══════════════════════════════════════════════════════════════════

function runComparison() {
  console.log("§6 — this.setState MERGES, useState REPLACES:\n");

  class Form extends ReactComponent {
    constructor(props) {
      super(props);
      this.state = { name: "Vineet", email: "v@x.com", age: 25 };
    }
  }

  const form = new Form({});
  form.setState({ name: "Ankit" });          // only touches `name`
  console.log("  class  this.setState({name:'Ankit'}) →", JSON.stringify(form.state));
  console.log("         email and age survived — setState does a SHALLOW MERGE.\n");

  // useState does NOT merge. It replaces.
  let hookState = { name: "Vineet", email: "v@x.com", age: 25 };
  const setHookState = (next) => { hookState = next; };

  setHookState({ name: "Ankit" });           // ← everything else is GONE
  console.log("  hooks  setState({name:'Ankit'})      →", JSON.stringify(hookState));
  console.log("         🐛 email and age vanished. useState REPLACES.\n");

  hookState = { name: "Vineet", email: "v@x.com", age: 25 };
  setHookState({ ...hookState, name: "Ankit" });   // spread it yourself
  console.log("  hooks  setState({...prev, name:'Ankit'}) →", JSON.stringify(hookState));
  console.log("         ✅ the fix. You do the merge, explicitly.\n");
  console.log("  This is the #1 class→hooks migration bug. The idiomatic answer");
  console.log("  is usually not spreading harder — it is splitting one object");
  console.log("  into several useState calls, or reaching for useReducer.\n");

  runFinal();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT CLASSES STILL DO THAT HOOKS CANNOT
// ══════════════════════════════════════════════════════════════════
//
// Be precise here — most candidates say "nothing, classes are dead."
// That is wrong, and interviewers know it.
//
// ERROR BOUNDARIES. That is the list.
//
//   componentDidCatch and getDerivedStateFromError have NO hook equivalent,
//   even in React 19. If you want to catch a render error in a subtree, you
//   write a class. Every library that offers one (react-error-boundary) has
//   a class at the bottom.
//
//   class ErrorBoundary extends React.Component {
//     state = { hasError: false };
//     static getDerivedStateFromError() { return { hasError: true }; }
//     componentDidCatch(error, info) { logToService(error, info); }
//     render() {
//       return this.state.hasError ? <Fallback /> : this.props.children;
//     }
//   }
//
// Why no hook? The React team has said a hook version is possible but they
// have not shipped one; the API is genuinely awkward because catching must
// happen ABOVE the component that threw, which is a tree-position concern,
// not a component-local one.
//
// Everything else classes had — lifecycles, state, refs, context — has a
// hook. And things hooks have that classes never will: custom hooks. You
// cannot share stateful logic between classes without HOCs or render props,
// which is exactly the wrapper hell hooks were built to end.


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   new Component() per call   the instance is stored on fiber.stateNode and
//                              REUSED across renders — that is the whole point
//   instance.render()          plus the full lifecycle, the update queue, and
//                              shouldComponentUpdate
//   props reassigned by hand   React sets instance.props before each render —
//                              literally the mutation that causes §5
//   isReactComponent check     the same check, plus a separate
//                              isPureReactComponent flag for PureComponent
//
// Two precise facts worth quoting:
//   • React has never announced deprecation for class components. They are
//     legacy, not removed, and the docs still document them.
//   • Function components are NOT faster because they are functions. Any real
//     difference comes from bundle size and from hooks enabling better
//     memoization — not from the calling convention.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Async callback shows the wrong props (class). → §5.
//
// Bug 2 — Async callback shows stale state (function):
//   The same mechanism, inverted. setInterval capturing render #1's count.
//   Fix: functional updater, or a ref, or correct deps.
//
// Bug 3 — State fields vanish after migrating to useState:
//   setState merged; useState replaces. → §6.
//
// Bug 4 — "Cannot read property 'setState' of undefined":
//   A class method passed as a handler loses `this`. Fix: class fields
//   (handleClick = () => {}) or bind in the constructor. Function components
//   simply do not have this problem — no `this` to lose.
//
// Bug 5 — Migrated componentDidMount to useEffect and got a flicker:
//   componentDidMount fires before paint; useEffect after. If you measure or
//   mutate the DOM, use useLayoutEffect.
//
// Bug 6 — Effect fires twice after migration:
//   StrictMode double-invokes in dev. That is not a class-vs-function
//   difference — it is React telling you the effect is not idempotent. → 12.
//
// Bug 7 — Trying to write an error boundary with hooks. It does not exist. → §7.
//
// Bug 8 — Rewriting a working class "because classes are old":
//   No user benefit, all the migration risk. Migrate when you touch it.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function runFinal() {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Detection:
  assert(typeof ClassGreeting === "function" && typeof FuncGreeting === "function",
    "both component types are functions — typeof cannot distinguish them");
  assert(isClassComponent(ClassGreeting), "the class carries isReactComponent");
  assert(!isClassComponent(FuncGreeting), "the function does not");
  assert(ClassGreeting.prototype.isReactComponent === ReactComponent.prototype.isReactComponent,
    "the marker is INHERITED from React.Component's prototype");

  // Calling a class without `new` throws — why React must check first:
  let threw = false;
  try { ClassGreeting({ name: "x" }); } catch { threw = true; }
  assert(threw, "a class cannot be called without new — hence the flag");

  // The §5 trap:
  assert(alerts.some(a => a === "class → Ankit"),
    "class read this.props at CALL time → the newest (wrong) props");
  assert(alerts.some(a => a === "function → Vineet"),
    "function captured props at RENDER time → the props the user clicked on");

  // The §6 trap:
  const f = new (class extends ReactComponent {
    constructor(p) { super(p); this.state = { a: 1, b: 2 }; }
  })({});
  f.setState({ a: 99 });
  assert(f.state.b === 2, "class setState MERGES — b survived");
  let hs = { a: 1, b: 2 };
  hs = { a: 99 };
  assert(hs.b === undefined, "useState REPLACES — b is gone");

  console.log("§10 — mini assertions passed for: Component types (class vs func)");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "class vs function components?", answer like this:
//
//   "Mechanically, a class is instantiated with new and React keeps that
//    instance on the fiber, mutating instance.props before each render. A
//    function is called fresh every render and closes over that render's
//    props and state. React tells them apart with a flag on the prototype —
//    isReactComponent — because typeof says 'function' for both, and calling
//    a class without new throws.
//
//    The interesting consequence is the async case. In a class, this.props is
//    a lookup resolved when the line runs, so a callback fired three seconds
//    later sees the NEWEST props — which is the wrong ones if the user has
//    navigated. In a function, props is captured by the closure, so the
//    callback stays consistent with the render the user actually clicked on.
//    The flip side is the stale closure: a setInterval in an empty-dep
//    useEffect captures the first render forever. Same mechanism, opposite
//    failure. Neither model is free.
//
//    The real argument for hooks isn't less code. Lifecycles grouped by
//    TIMING — one subscription split across didMount, didUpdate and
//    willUnmount, while one didMount mixed three unrelated concerns. Hooks
//    group by CONCERN, and custom hooks let you share stateful logic without
//    HOCs or render props.
//
//    Classes aren't deprecated, and there's still exactly one thing only they
//    do: error boundaries. componentDidCatch has no hook equivalent even in
//    React 19."
//
// That last fact is the one that marks you as someone who has actually shipped.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does React know a component is a class?
// A1. Component.prototype.isReactComponent — a marker inherited from
//     React.Component. Not typeof (both are functions), not the name.
//
// Q2. Why can't it just call the class?
// A2. ES6 classes throw if called without new. React must know beforehand.
//
// Q3. Is useEffect(fn, []) the same as componentDidMount?
// A3. No. componentDidMount runs before paint; useEffect after. The true
//     equivalent is useLayoutEffect. And StrictMode double-invokes effects.
//
// Q4. Why did hooks replace lifecycles?
// A4. Lifecycles group by timing, so one concern splits across three methods
//     and three concerns share one method. Hooks group by concern and make
//     stateful logic shareable via custom hooks.
//
// Q5. Are function components faster?
// A5. Not intrinsically. Smaller bundles and better memoization, but the
//     calling convention itself is not the win.
//
// Q6. What can classes do that hooks cannot?
// A6. Error boundaries — componentDidCatch / getDerivedStateFromError. That
//     is the entire list.
//
// Q7. Why does this.props give the wrong value in a setTimeout?
// A7. It is a property lookup on a mutable instance, resolved at call time.
//     React has already replaced instance.props by then.
//
// Q8. Migration gotcha from setState to useState?
// A8. setState shallow-merges; useState replaces. Spread the previous state,
//     or split into multiple useState, or use useReducer.
//
// Q9. Should we rewrite our class components?
// A9. No. They work and they are not deprecated. Migrate opportunistically
//     when you are already changing the file.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: How does React detect a class component?
//   Back : Component.prototype.isReactComponent. Never typeof.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : this.props = lookup at call time. props = captured at render time.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : setState merges, useState replaces.
//
// Flashcard 4:
//   Front: Why hooks, really?
//   Back : Lifecycles group by timing. Hooks group by concern — and compose.
//
// Flashcard 5:
//   Front: What only classes can do?
//   Back : Error boundaries. No hook exists, even in React 19.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Name the async this.props bug AND its mirror image, the stale closure.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write isClassComponent from memory. One line. Then explain why React
//   cannot use typeof.
//
// Task 2:
//   Extend ReactComponent with a real setState QUEUE that batches and calls
//   render once. You have rebuilt the class update path.
//
// Task 3:
//   Reproduce §5's bug in reverse: build a function component whose
//   setInterval logs a stale count, then fix it three ways (functional
//   updater, ref, correct deps).
//
// Task 4:
//   Convert a class with componentDidMount + componentDidUpdate +
//   componentWillUnmount for ONE subscription into a single useEffect.
//   Count the lines. That is the hooks argument, measured.
//
// Task 5:
//   Try to write an error boundary as a hook. Get stuck. Articulate exactly
//   WHY it cannot work — that is the real answer to §7.
//
// Task 6:
//   Explain in 60 seconds why the class alert shows the wrong name, without
//   using the word "closure".


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A class instance MUTATES over time. A function render FREEZES in time.
//
// If you remember the common bug:
//   this.props in an async callback gives the newest props — not the ones the
//   user was looking at. And useState replaces where setState merged.
//
// If you remember the professional framing:
//   Hooks group by concern, lifecycles grouped by timing. Classes are legacy,
//   not deprecated — and error boundaries still need one.
//
// NEXT TOPIC -> 10_controlled-vs-uncontrolled-components.js
