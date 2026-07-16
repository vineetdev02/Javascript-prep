// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL         ║
// ║              ◆ Variables & Scope — MASTER INDEX                 ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 📁 FOLDER : Variables_and_Scope/
// 📄 FILE   : index.js  ← START HERE every session
// 🎯 GOAL   : Big picture of all 9 topics. Quick intro + code.
//             Deep dives are in the numbered files.
//
// ══════════════════════════════════════════════════════════════════
// 🗺️  FOLDER STRUCTURE
// ══════════════════════════════════════════════════════════════════
//
//  Variables_and_Scope/
//  ├── index.js                          
//  ├── 01_var-vs-let-vs-const.js
//  ├── 02_hoisting.js
//  ├── 03_temporal-dead-zone.js
//  ├── 04_block-vs-function-scope.js
//  ├── 05_global-scope-pollution.js
//  ├── 06_variable-shadowing.js
//  ├── 07_lexical-scoping.js
//  ├── 08_scope-chain.js
//  └── 09_closures.js
//
// ══════════════════════════════════════════════════════════════════
// 📌 POINT 1 — var vs let vs const
// ══════════════════════════════════════════════════════════════════
// Three declaration keywords, three different behavior sets.
// var  → function-scoped, hoisted as undefined, avoid in modern code.
// let  → block-scoped, TDZ, use when value changes.
// const → block-scoped, TDZ, use by DEFAULT for everything else.
//
//  ┌────────────┬──────────────┬────────────┬─────────────────┐
//  │            │     var      │    let     │      const      │
//  ├────────────┼──────────────┼────────────┼─────────────────┤
//  │ Scope      │  Function    │   Block    │     Block       │
//  │ Hoisted    │ Yes(undef)   │  Yes(TDZ)  │    Yes(TDZ)     │
//  │ Reassign   │    Yes       │    Yes     │      No         │
//  │ Redeclare  │    Yes       │    No      │      No         │
//  │ window obj │    Yes       │    No      │      No         │
//  └────────────┴──────────────┴────────────┴─────────────────┘

var  legacy = "function scoped";
let  mutable = "block scoped, can reassign";
const fixed  = "block scoped, no reassign";

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 2 — Hoisting Behavior
// ══════════════════════════════════════════════════════════════════
// JS engine makes TWO passes:
//   Compile pass → registers all declarations
//   Execute pass → runs code top to bottom
//
// var   → hoisted + initialized as undefined  (safe to read, wrong value)
// let/const → hoisted but in TDZ              (crash if read early)
// function declarations → FULLY hoisted        (callable before definition)

console.log(hoistedVar); // undefined (no crash)
var hoistedVar = "I was hoisted";

// console.log(hoistedLet); // ❌ ReferenceError
let hoistedLet = "NOT hoisted usably";

greet(); // ✅ works — function declaration fully hoisted
function greet() { console.log("Hello from hoisted function!"); }

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 3 — Temporal Dead Zone (TDZ)
// ══════════════════════════════════════════════════════════════════
// TDZ = the zone from start of block → let/const declaration line.
// Variable EXISTS in scope but is UNINITIALIZED → ReferenceError.
// This is INTENTIONAL — prevents silent "use before declare" bugs.

function tdz_demo() {
  // console.log(val); // ❌ ReferenceError — TDZ
  let val = "now safe";
  console.log(val);   // ✅
}
tdz_demo();

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 4 — Block Scope vs Function Scope
// ══════════════════════════════════════════════════════════════════
// FUNCTION SCOPE: var lives inside the nearest enclosing function.
// BLOCK SCOPE   : let/const live inside the nearest { } block.
// var LEAKS out of if/for/while — let/const do not.

if (true) {
  var  leaked  = "I escape the block!";
  let  trapped = "I stay inside";
}
console.log(leaked);    // ✅ "I escape the block!"
// console.log(trapped);// ❌ ReferenceError

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 5 — Global Scope Pollution
// ══════════════════════════════════════════════════════════════════
// Global scope pollution = dumping variables into global scope carelessly.
// Risks: name collisions, window API overwrites, hard-to-trace bugs.
// Fixes: let/const, IIFE, ES Modules, namespacing.

// var name = "Alice"; // ← overwrites window.name in browser! 🚨

// Safe pattern using an IIFE:
(function() {
  var safeVar = "hidden from global scope"; // ✅ contained
})();

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 6 — Variable Shadowing
// ══════════════════════════════════════════════════════════════════
// Declaring a variable in inner scope with SAME name as outer scope.
// The inner one "shadows" (hides) the outer during its block.
// Outer variable is UNCHANGED after the block ends.

const appEnv = "production";
function deploy() {
  const appEnv = "staging";     // shadows outer
  console.log(appEnv);          // "staging"
}
deploy();
console.log(appEnv);             // "production" — untouched

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 7 — Lexical Scoping
// ══════════════════════════════════════════════════════════════════
// Scope is determined at WRITE time (where function is DEFINED),
// NOT at call time (where function is INVOKED).
// This is why JS is called a "lexically scoped" language.

const theme = "dark";
function renderUI() {
  console.log(theme); // uses its lexical scope → "dark"
}
function fakeTheme() {
  const theme = "light"; // local, doesn't affect renderUI
  renderUI();            // still prints "dark"!
}
fakeTheme();

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 8 — Scope Chain
// ══════════════════════════════════════════════════════════════════
// When JS resolves a variable, it walks UP the chain of scopes:
// current → parent → grandparent → ... → global → ReferenceError

const level = "global";
function outerFn() {
  const level = "outer";
  function innerFn() {
    // No local `level` here → walks up chain → finds "outer"
    console.log(level); // "outer"
  }
  innerFn();
}
outerFn();

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 9 — Closure Definition & Use Case
// ══════════════════════════════════════════════════════════════════
// Closure = function that REMEMBERS its outer scope variables
//           even AFTER the outer function has returned.
// This is the most interviewed JS concept at senior level.

function makeCounter(start = 0) {
  let count = start; // `count` is closed over
  return {
    increment: () => ++count,
    decrement: () => --count,
    value:     () => count,
  };
}
const counter = makeCounter(10);
counter.increment(); // 11
counter.increment(); // 12
counter.decrement(); // 11
console.log(counter.value()); // 11  ← remembers state!

// ══════════════════════════════════════════════════════════════════
// ❓ QUICK-FIRE OVERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1.  What are the 3 variable keywords? Key differences?
// Q2.  What is scope? Types of scope in JavaScript?
// Q3.  What is hoisting? How does it differ for var vs let?
// Q4.  What is the Temporal Dead Zone?
// Q5.  Difference between block scope and function scope?
// Q6.  What is global scope pollution and how to prevent it?
// Q7.  What is variable shadowing? Can it cause bugs?
// Q8.  What is lexical scoping? Why does it matter?
// Q9.  What is the scope chain? How does JS resolve variable names?
// Q10. What is a closure? Give 3 real-world use cases.
//
// 📚 STUDY ORDER:
//   Day 1 → index.js + 01_var-vs-let-vs-const.js
//   Day 2 → 02_hoisting.js + 03_temporal-dead-zone.js
//   Day 3 → 04_block-vs-function-scope.js + 05_global-scope-pollution.js
//   Day 4 → 06_variable-shadowing.js + 07_lexical-scoping.js
//   Day 5 → 08_scope-chain.js + 09_closures.js
//   Day 6 → All 9 interview question sets, cold, no hints
