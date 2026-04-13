// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  04_block-vs-function-scope.js           ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What a block is and what a function scope is
//    • How var leaks from blocks but not functions
//    • How let/const are correctly contained in blocks
//    • Nested scopes and scope boundaries
//    • Real bugs caused by scope confusion
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS A SCOPE BOUNDARY?
// ══════════════════════════════════════════════════════════════════
//
// A scope boundary is the "fence" around code that decides which
// variables can be seen from outside.
//
// In JavaScript there are two kinds of boundaries:
//
//   FUNCTION BOUNDARY: created by any function { }
//     → var, let, const declared inside CANNOT be seen outside
//     → This is where var "stops" — it respects function boundaries
//
//   BLOCK BOUNDARY: created by any { } that is NOT a function
//     → if { }, else { }, for { }, while { }, try { }, catch { }
//     → Even a standalone { } creates a block
//     → let and const respect this boundary
//     → var IGNORES this boundary (it only respects function boundary)


// ══════════════════════════════════════════════════════════════════
// § 2 — FUNCTION SCOPE (var, let, const all respect this)
// ══════════════════════════════════════════════════════════════════

function functionScopeDemo() {
  var   insideVar   = "I belong to this function";
  let   insideLet   = "I belong to this function";
  const insideConst = "I belong to this function";

  console.log(insideVar);   // ✅
  console.log(insideLet);   // ✅
  console.log(insideConst); // ✅
}
functionScopeDemo();

// ALL THREE are invisible outside the function:
// console.log(insideVar);   // ❌ ReferenceError
// console.log(insideLet);   // ❌ ReferenceError
// console.log(insideConst); // ❌ ReferenceError

// ── Nested functions: each creates its own scope ─────────────────
function outer() {
  const outerVar = "outer";

  function inner() {
    const innerVar = "inner";
    console.log(outerVar); // ✅ inner can see outer's scope (scope chain)
    console.log(innerVar); // ✅
  }

  inner();
  // console.log(innerVar); // ❌ outer CANNOT see inner's scope
}
outer();


// ══════════════════════════════════════════════════════════════════
// § 3 — BLOCK SCOPE  ← The key difference between var and let/const
// ══════════════════════════════════════════════════════════════════

// ── 3A. var IGNORES block boundaries ─────────────────────────────
console.log("=== VAR IN BLOCKS ===");

if (true) {
  var ifVar = "declared in if-block";
}
console.log(ifVar); // ✅ "declared in if-block"  — leaked!

for (var fi = 0; fi < 1; fi++) {
  var forVar = "declared in for-block";
}
console.log(forVar); // ✅ "declared in for-block" — leaked!
console.log(fi);     // ✅ 1 — loop counter leaked!

while (false) {
  var whileVar = "declared in while-block (never executed)";
}
console.log(whileVar); // ✅ undefined — hoisted even though block never ran!

try {
  var tryVar = "declared in try-block";
} catch(e) {}
console.log(tryVar); // ✅ "declared in try-block" — leaked!

// Standalone block:
{
  var standaloneVar = "declared in standalone block";
}
console.log(standaloneVar); // ✅ "declared in standalone block" — leaked!

// ── 3B. let/const RESPECT block boundaries ───────────────────────
console.log("=== LET/CONST IN BLOCKS ===");

if (true) {
  let ifLet   = "declared in if-block";
  const ifConst = "also in if-block";
  console.log(ifLet, ifConst); // ✅ inside block
}
// console.log(ifLet);   // ❌ ReferenceError — correctly contained
// console.log(ifConst); // ❌ ReferenceError — correctly contained

for (let li = 0; li < 1; li++) {
  let forLet = "declared in for-block";
  console.log(forLet); // ✅ inside block
}
// console.log(forLet); // ❌ ReferenceError
// console.log(li);     // ❌ ReferenceError — li is block-scoped too!

{
  let standalone = "in standalone block";
  console.log(standalone); // ✅
}
// console.log(standalone); // ❌ ReferenceError


// ══════════════════════════════════════════════════════════════════
// § 4 — WHY var's FUNCTION SCOPE WAS THE ORIGINAL DESIGN
// ══════════════════════════════════════════════════════════════════
//
// In early JS (Brendan Eich, 1995), JS was modeled loosely after
// C and Java — but only function bodies were given their own scope.
// { } blocks in if/for/while were NOT scopes in early JS.
//
// This made sense for Java/C because they have block scope natively.
// But in JS, var was the only keyword — and it was function-scoped.
// This led to decades of bugs.
//
// ES6 (2015) finally added let/const with proper block scope.
// Now you SHOULD use let/const everywhere to get predictable scoping.

// ── Classic var leaking bug in real code ─────────────────────────
function calculateTotal(prices) {
  var total = 0;

  for (var i = 0; i < prices.length; i++) {
    var currentPrice = prices[i]; // ← leaks out of for-block!
    total += currentPrice;
  }

  // AFTER the loop, these are still accessible:
  console.log("var i:", i);            // last index (leaked)
  console.log("var currentPrice:", currentPrice); // last price (leaked)

  return total;
}
calculateTotal([10, 20, 30]);

// With let — clean, no leaks:
function calculateTotalClean(prices) {
  let total = 0;

  for (let i = 0; i < prices.length; i++) {
    const currentPrice = prices[i]; // ← stays in for-block
    total += currentPrice;
  }

  // console.log(i);            // ❌ ReferenceError — clean!
  // console.log(currentPrice); // ❌ ReferenceError — clean!

  return total;
}
console.log(calculateTotalClean([10, 20, 30])); // 60


// ══════════════════════════════════════════════════════════════════
// § 5 — MODULE SCOPE (bonus for senior level)
// ══════════════════════════════════════════════════════════════════
//
// When you use ES Modules (import/export), each file gets its OWN scope.
// Variables declared at the top level of a module are NOT global.
// They are scoped to that module.
//
// This is different from script tags in HTML (which share global scope).
//
// module-a.js:
//   export const secret = "module A secret";
//
// module-b.js:
//   import { secret } from './module-a.js';
//   // Only has access because of explicit export/import
//   // Cannot access other variables from module-a.js
//
// This is a fourth scope type beyond global/function/block.


// ══════════════════════════════════════════════════════════════════
// § 6 — SCOPE COMPARISON WITH ALL KEYWORDS
// ══════════════════════════════════════════════════════════════════

function allScopeComparison() {
  // All three: visible throughout the function
  var   funcVar   = "function-scoped";
  let   funcLet   = "block-scoped (function block)";
  const funcConst = "block-scoped (function block)";

  {
    // Inner block:
    var  innerVar   = "I will leak to function scope";
    let  innerLet   = "I stay in this block";
    const innerConst = "I stay in this block";

    console.log(funcVar);    // ✅ can see outer
    console.log(funcLet);    // ✅ can see outer
    console.log(funcConst);  // ✅ can see outer
    console.log(innerVar);   // ✅ own scope
    console.log(innerLet);   // ✅ own scope
    console.log(innerConst); // ✅ own scope
  }

  console.log(innerVar);   // ✅ var leaked into function scope
  // console.log(innerLet);   // ❌ ReferenceError
  // console.log(innerConst); // ❌ ReferenceError
}
allScopeComparison();


// ══════════════════════════════════════════════════════════════════
// § 7 — PRACTICAL EXAMPLES & PATTERNS
// ══════════════════════════════════════════════════════════════════

// ── Pattern 1: Using blocks for temporary variables ──────────────
// Sometimes you want a throwaway variable that doesn't pollute scope:

let result;
{
  // This block is just for scoping — not if/for/while
  const temp1 = 100 * 2;
  const temp2 = temp1 + 50;
  result = temp2 / 5;
  // temp1 and temp2 never leak outside
}
console.log(result); // 50 ✅
// console.log(temp1); // ❌ contained

// ── Pattern 2: Correct event handler scoping ─────────────────────
// Bug-free version:
const buttons = ["btn1", "btn2", "btn3"];
buttons.forEach((btn, index) => {
  // `btn` and `index` are fresh per iteration — block scoped
  setTimeout(() => {
    console.log(`Button ${index}: ${btn} clicked`);
  }, index * 100);
});
// Output: 0:btn1, 1:btn2, 2:btn3  ✅

// ── Pattern 3: try/catch scope ───────────────────────────────────
try {
  const riskyOperation = JSON.parse('{"valid": true}');
  console.log(riskyOperation.valid); // true ✅
} catch (error) {
  // `error` is scoped to the catch block only
  console.error(error.message);
}
// console.log(error);         // ❌ ReferenceError — error is catch-scoped
// console.log(riskyOperation);// ❌ ReferenceError — const, block-scoped


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is the difference between function scope and block scope?
//
// Function scope: variable is accessible anywhere inside the function
// it was declared in. var is function-scoped.
// Block scope: variable is accessible only inside the { } block it was
// declared in (if/for/while/standalone). let and const are block-scoped.
// The key difference: var escapes from if/for/while blocks. let/const don't.

// ── Q2. What is a block in JavaScript? ──────────────────────────
//
// Any code surrounded by { }. This includes:
// if/else bodies, for/while/do-while bodies, try/catch/finally bodies,
// function bodies, and standalone { } used just for scoping.
// A function body is a special block — var is scoped to functions,
// but for all other blocks, only let/const are block-scoped.

// ── Q3. Does var have block scope? ──────────────────────────────
//
// No. var only has function scope. It ignores if/for/while/try block
// boundaries and "floats up" to the nearest enclosing function.
// This is why var declared in a for-loop is accessible after the loop.

// ── Q4. What happens here? ───────────────────────────────────────
//
//   while (false) {
//     var ghostVar = "I never run";
//   }
//   console.log(ghostVar);
//
// Answer: undefined.
// Even though the while block NEVER executes, var ghostVar is hoisted
// to the outer scope during compilation. So it exists as undefined.
// This is another var hoisting + function-scope bug in one.

// ── Q5. How would you use a block to prevent scope pollution? ─────
//
// Use a standalone { } block with let/const. Variables inside stay
// contained and don't pollute the outer scope:
//   {
//     const temp = heavyComputation();
//     result = process(temp);
//   }
//   // temp is gone here, result is available

// ── Q6. What is module scope? ────────────────────────────────────
//
// ES Modules give each file its own scope. Top-level variables in a
// module are not global — they are module-scoped. They can only be
// shared via explicit export/import. This prevents the global scope
// pollution that script tags cause when multiple JS files all write
// to the global window object.

// ── Q7. What is the output? ─────────────────────────────────────
//
//   for (var i = 0; i < 3; i++) {
//     setTimeout(() => console.log(i), 0);
//   }
//
// Answer: 3, 3, 3
// var i is function-scoped. One shared i. By the time setTimeout
// callbacks run, loop is done, i === 3. All callbacks share same i.
// Fix: use let (new binding per iteration).

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 05_global-scope-pollution.js
// ══════════════════════════════════════════════════════════════════
