// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  01_jsx-compilation.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: JSX compilation
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. What Babel actually outputs for your JSX
//   3. A working createElement you build yourself
//   4. Why the rules of JSX exist (capital letters, className, keys)
//   5. Real bugs caused by not knowing the compile step
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/01_jsx-compilation.js"
//
// NOTE ON THIS MODULE:
//   JSX cannot run in plain Node. So we do the thing that actually
//   impresses interviewers: we implement the compile target ourselves.
//   Everything below runs with zero dependencies.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// JSX compilation:
// JSX is not HTML and it is not part of JavaScript — it is syntax sugar
// that a compiler (Babel/SWC/TypeScript) turns into plain function calls
// that return plain objects.
//
// If interviewer says "explain it simply", say:
// "JSX compiles to React.createElement calls. Those calls return plain
//  objects. React renders objects, not JSX."
//
// If interviewer asks "why does it matter?", say:
// "Because every JSX rule that confuses juniors — why components must be
//  capitalized, why it is className not class, why you cannot return two
//  root nodes — is explained by the compile output, not by React magic."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   syntax sugar over function calls
//
// The pipeline:
//   JSX  ──Babel──>  createElement(...)  ──runs──>  element object
//        ──────────>  React reads object tree  ──>  DOM
//
// Runtime rule:
//   JSX evaluates bottom-up. Children are compiled and evaluated as
//   arguments BEFORE the parent call runs.
//
// Practical rule:
//   If you cannot picture the createElement output of your JSX, you cannot
//   reason about re-renders, keys, or why a prop is undefined.
//
// Common trap:
//   Thinking JSX is a template/string. It is an expression that produces
//   an object — which is why you can store it in a variable, return it
//   from a function, or put it in an array.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHAT BABEL ACTUALLY OUTPUTS
// ══════════════════════════════════════════════════════════════════
//
// You write this JSX:
//
//   const el = (
//     <div className="card" onClick={handleClick}>
//       <h1>Hello</h1>
//       {user.name}
//     </div>
//   );
//
// Classic runtime (React 16 and earlier style, still asked in interviews):
//
//   const el = React.createElement(
//     "div",
//     { className: "card", onClick: handleClick },
//     React.createElement("h1", null, "Hello"),
//     user.name
//   );
//
// Modern JSX transform (React 17+, what you actually get today):
//
//   import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
//
//   const el = _jsxs("div", {
//     className: "card",
//     onClick: handleClick,
//     children: [_jsx("h1", { children: "Hello" }), user.name]
//   });
//
// Interview gold:
//   "React 17 introduced the automatic runtime. That is why you no longer
//    need `import React from 'react'` in every file — the compiler imports
//    jsx() from react/jsx-runtime for you. Also `jsxs` is used when children
//    are statically known to be an array, so React can skip a check."


// ══════════════════════════════════════════════════════════════════
// § 4 — BUILD createElement YOURSELF (this is the real drill)
// ══════════════════════════════════════════════════════════════════

const REACT_ELEMENT_TYPE = Symbol.for("react.element");

function createElement(type, config, ...children) {
  const props = {};
  let key = null;
  let ref = null;

  // key and ref are NOT props. React pulls them out of config.
  // This is why `props.key` is always undefined inside your component.
  for (const name in config) {
    if (name === "key") {
      key = String(config[name]);
    } else if (name === "ref") {
      ref = config[name];
    } else {
      props[name] = config[name];
    }
  }

  // children become props.children — one value if single, array if many.
  if (children.length === 1) {
    props.children = children[0];
  } else if (children.length > 1) {
    props.children = children;
  }

  return {
    $$typeof: REACT_ELEMENT_TYPE, // guards against JSON injection attacks
    type,                          // "div" (host) or function (component)
    key,
    ref,
    props,
  };
}

// Now compile this JSX BY HAND:
//
//   <div className="card">
//     <h1>Hello</h1>
//     Vineet
//   </div>

const element = createElement(
  "div",
  { className: "card" },
  createElement("h1", null, "Hello"),
  "Vineet"
);

console.log("§4 — element object:");
console.log(JSON.stringify(element, (k, v) =>
  (typeof v === "symbol" ? v.toString() : v), 2));

// Read that output carefully. That object IS your UI.
// React never sees your JSX. It only ever sees this.


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY COMPONENTS MUST BE CAPITALIZED
// ══════════════════════════════════════════════════════════════════
//
// This is the single most common "why?" in React interviews,
// and the compile output answers it in one line.
//
//   <button />   compiles to  createElement("button")   ← STRING
//   <Button />   compiles to  createElement(Button)     ← VARIABLE
//
// Lowercase = the compiler passes a string = React makes a real DOM node.
// Capitalized = the compiler passes your identifier = React calls your function.
//
// So if you write <button /> expecting YOUR component, React renders the
// HTML <button> instead and silently ignores you. No error. Just wrong UI.

function Button(props) {
  return createElement("button", null, props.children);
}

const hostElement = createElement("button", null, "I am real HTML");
const componentElement = createElement(Button, null, "I am your component");

console.log("\n§5 — capitalization decides everything:");
console.log("  <button /> type is:", typeof hostElement.type, `(${hostElement.type})`);
console.log("  <Button />  type is:", typeof componentElement.type, `(${componentElement.type.name})`);

// Rule to say out loud in the interview:
//   "The type field is either a string or a function. The capital letter is
//    what decides which one the compiler emits."


// ══════════════════════════════════════════════════════════════════
// § 6 — WHY className AND NOT class
// ══════════════════════════════════════════════════════════════════
//
// Because props become a real JavaScript object literal:
//
//   <div class="card" />  →  createElement("div", { class: "card" })
//
// `class` was a reserved word in older JS, and JSX props map to DOM
// properties (element.className), not HTML attributes. Same reason:
//   for      → htmlFor
//   tabindex → tabIndex   (DOM properties are camelCase)
//
// Modern React (19+) does accept `class` on host elements, but interviews
// still expect the historical reason. Say the reason, then say "React 19
// relaxed this."


// ══════════════════════════════════════════════════════════════════
// § 7 — WHY YOU CANNOT RETURN TWO ROOT NODES
// ══════════════════════════════════════════════════════════════════
//
// You write:
//
//   return (
//     <h1>A</h1>
//     <h2>B</h2>
//   );
//
// It compiles to:
//
//   return (
//     createElement("h1", null, "A")
//     createElement("h2", null, "B")   ← two expressions, no operator
//   );
//
// That is not valid JavaScript. A function returns ONE value.
// This is a JavaScript limitation, not a React design choice.
//
// Fix: <>...</> compiles to createElement(React.Fragment, null, a, b)
// — one call, one return value. See 06_react-fragment.js.


// ══════════════════════════════════════════════════════════════════
// § 8 — PREDICT THE OUTPUT DRILL
// ══════════════════════════════════════════════════════════════════
//
// Question interviewers actually ask:
//   "In what order do these console.logs fire?"

function Child() {
  console.log("  Child function CALLED");
  return createElement("span", null, "child");
}

console.log("\n§8 — predict the order:");
console.log("  before creating tree");

const tree = createElement(
  "div",
  null,
  createElement(Child, null)   // ← does Child run here?
);

console.log("  after creating tree");
console.log("  tree.props.children.type is a function?",
  typeof tree.props.children.type === "function");

// ANSWER: "Child function CALLED" never prints.
//
// createElement(Child) does NOT call Child. It only stores the reference
// in `type`. React calls it later, during render.
//
// This is the difference between:
//   <Child />    → createElement(Child)  → React calls it, gets state/hooks
//   {Child()}    → you call it yourself  → just a function call, NO hooks,
//                                          NO reconciliation identity
//
// Senior insight:
//   "Calling a component as a plain function is a real production bug.
//    The component gets no fiber, so its useState is attached to the
//    PARENT's hook list. That is how you get the classic
//    'rendered fewer hooks than expected' crash."


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Lowercase custom component:
//   <myButton />  renders an unknown HTML tag <mybutton>, silently.
//   Fix: capitalize. Always.
//
// Bug 2 — Calling components directly:
//   {Header()} instead of <Header />
//   Symptom: hooks explode, memo does nothing, DevTools shows no component.
//
// Bug 3 — Dynamic component from a lowercase variable:
//   const tag = "div";  <tag />  → literally renders <tag>
//   Fix: capitalize the VARIABLE: const Tag = "div"; <Tag />
//   Because the compiler checks the letter case of the identifier you wrote.
//
// Bug 4 — Expecting props.key to exist:
//   <Item key="1" />  → key is stripped before props are built (see §4).
//   Fix: pass it twice if you need it: <Item key={id} id={id} />
//
// Bug 5 — Objects are not valid as a React child:
//   {user} where user is an object → crash.
//   Because children go straight into props, and React can only render
//   strings, numbers, elements, arrays, null/undefined/false.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

const keyed = createElement("li", { key: "abc", id: "abc" }, "item");

assert(keyed.key === "abc", "key is lifted out of config");
assert(keyed.props.key === undefined, "key is NOT a prop");
assert(keyed.props.id === "abc", "normal props stay in props");
assert(typeof hostElement.type === "string", "host element type is a string");
assert(typeof componentElement.type === "function", "component type is a function");
assert(element.props.children.length === 2, "multiple children become an array");

console.log("\n§10 — mini assertions passed for: JSX compilation");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is JSX?", answer like this:
//
//   "JSX is syntax sugar. Babel compiles every tag into a jsx() or
//    React.createElement() call, and that call returns a plain object with
//    type, key, ref and props. React renders that object tree — it never
//    sees JSX. Since React 17 the transform is automatic, which is why the
//    React import is no longer required.
//
//    This matters because it explains the rules: capitalized names compile
//    to a variable reference and lowercase to a string, key and ref are
//    lifted out of props, and two root nodes fail because a function can
//    only return one value."
//
// Then write the createElement output for a small JSX snippet on the board.
// Candidates who can do that transform by hand read as senior immediately.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does JSX compile to?
// A1. jsx()/jsxs() from react/jsx-runtime (React 17+), or
//     React.createElement (classic runtime). Both return an element object.
//
// Q2. Why is $$typeof a Symbol?
// A2. Security. Symbols cannot survive JSON.parse, so a server that leaks
//     user JSON into a render slot cannot forge a React element and inject
//     a component. It is an XSS guard.
//
// Q3. Why must components be capitalized?
// A3. The compiler emits a string for lowercase and an identifier for
//     capitalized. String means host DOM node, identifier means your function.
//
// Q4. Is <Child /> the same as Child()?
// A4. No. <Child /> creates an element React will call later with its own
//     fiber and hook list. Child() is an immediate call with no fiber —
//     its hooks bind to the parent and break the hook order.
//
// Q5. Why is key not available in props?
// A5. createElement lifts key and ref out of config before building props.
//     React uses key for reconciliation identity, not for rendering.
//
// Q6. What is jsxs vs jsx?
// A6. jsxs is emitted when the compiler statically knows children are an
//     array, letting React skip a runtime check. Pure optimization.
//
// Q7. Can you use JSX without React?
// A7. Yes. The pragma is configurable — Preact uses h(), and you can set
//     @jsxImportSource to any library exposing a jsx-runtime.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is JSX?
//   Back : Syntax sugar compiling to function calls that return objects.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : type is a string for host elements, a function for components.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Thinking JSX is a template. It is an expression producing an object.
//
// Flashcard 4:
//   Front: Why no React import in React 17+?
//   Back : The automatic transform imports jsx() from react/jsx-runtime.
//
// Flashcard 5:
//   Front: How do you sound senior?
//   Back : Do the JSX → createElement transform by hand, then explain a
//          React rule using the output.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Compile this by hand, then check with the createElement above:
//     <ul className="list">
//       {items.map(i => <li key={i.id}>{i.text}</li>)}
//     </ul>
//   Hint: what is props.children when map returns an array?
//
// Task 2:
//   Add a Fragment to the createElement in §4. Give it Symbol.for("react.fragment")
//   as its type and prove it holds two children in one return value.
//
// Task 3:
//   Break it on purpose: render <Button /> as <button /> and explain from
//   the element object why the text still appears but the component never runs.
//
// Task 4:
//   Extend createElement to warn when type is a lowercase string that is
//   not a known HTML tag. That is roughly React's own dev-mode warning.
//
// Task 5:
//   Explain in 60 seconds why {Header()} breaks hooks but <Header /> does not.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   JSX → createElement/jsx call → plain object { $$typeof, type, key, ref, props }
//
// If you remember the common bug:
//   Calling a component directly ({Header()}) instead of rendering it
//   (<Header />) — it has no fiber, so its hooks attach to the parent.
//
// If you remember the professional framing:
//   Every "weird" JSX rule is just JavaScript showing through the sugar.
//
// NEXT TOPIC -> 02_virtual-dom-concept.js
