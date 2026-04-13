// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  02_hoisting.js                          ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What hoisting actually IS under the hood
//    • var vs let/const vs function hoisting (all 4 cases)
//    • Function declaration vs function expression hoisting
//    • Class hoisting (bonus — asked at senior level)
//    • Real bugs caused by hoisting + how to avoid them
//    • 8 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS HOISTING?
// ══════════════════════════════════════════════════════════════════
//
// Hoisting is NOT a physical movement of code.
// It is a result of how the JS engine processes your file in TWO phases:
//
//   PHASE 1 — COMPILATION (memory allocation)
//     The engine scans the ENTIRE scope before running any code.
//     It finds all `var`, `let`, `const`, `function` declarations
//     and registers them in memory.
//
//   PHASE 2 — EXECUTION (runs top to bottom)
//     Your code runs line by line.
//     Variables are assigned their values when execution reaches that line.
//
// "Hoisting" = the result of Phase 1 making declarations available
// BEFORE Phase 2 reaches their line.
//
// KEY RULE: Only DECLARATIONS are hoisted. ASSIGNMENTS are not.
//
//   var name = "Alice";
//   ↑ declaration  ↑ assignment
//   (hoisted)      (stays in place)


// ══════════════════════════════════════════════════════════════════
// § 2 — var HOISTING
// ══════════════════════════════════════════════════════════════════

// ── What you write ───────────────────────────────────────────────
console.log(score); // undefined  ← no crash! hoisted as undefined
var score = 100;
console.log(score); // 100

// ── What the JS engine actually processes ────────────────────────
//   var score = undefined;   ← Phase 1: declaration hoisted + init to undefined
//   console.log(score);      ← Phase 2 line 1: prints undefined
//   score = 100;             ← Phase 2 line 2: assignment runs
//   console.log(score);      ← Phase 2 line 3: prints 100

// ── Why this is DANGEROUS ────────────────────────────────────────
// You read `score` before assigning it.
// var gives you undefined silently — no warning.
// You might use that undefined in a calculation and get NaN
// without any obvious error message.

function dangerousVar() {
  console.log(price * 2);  // NaN — not a ReferenceError, SILENT BUG
  var price = 50;
  console.log(price * 2);  // 100
}
dangerousVar();


// ══════════════════════════════════════════════════════════════════
// § 3 — let AND const HOISTING
// ══════════════════════════════════════════════════════════════════
//
// let and const ARE hoisted — but they are NOT initialized.
// They sit in the Temporal Dead Zone (TDZ) from start of scope
// until their declaration line is executed.
// Accessing them in TDZ → ReferenceError (intentional crash — better than silent bug).

// console.log(userAge); // ❌ ReferenceError: Cannot access 'userAge' before initialization
let userAge = 25;
console.log(userAge); // ✅ 25

// console.log(MAX_SCORE); // ❌ ReferenceError
const MAX_SCORE = 1000;
console.log(MAX_SCORE); // ✅ 1000

// PROOF that let IS hoisted (not just absent):
// If let were NOT hoisted at all, it would look up to outer scope.
// But it doesn't — it knows about the inner let and throws TDZ.
let outer = "outer";
{
  // console.log(outer); // ❌ ReferenceError (TDZ of inner `outer` — not looking outside!)
  let outer = "inner"; // inner let IS hoisted for this block, creating TDZ above
  console.log(outer);  // "inner"
}


// ══════════════════════════════════════════════════════════════════
// § 4 — FUNCTION DECLARATION HOISTING  ← Most Useful Type
// ══════════════════════════════════════════════════════════════════
//
// Function DECLARATIONS are FULLY hoisted.
// The entire function (name + body) is moved to the top.
// You can call them BEFORE their definition in the code.

// Calling BEFORE definition:
result = add(3, 7);  // ✅ works! returns 10
console.log(result);

function add(a, b) {
  return a + b;
}

// WHY is this useful?
// It lets you write "main logic first, helpers at the bottom"
// which some people find more readable.

// main logic at top
function main() {
  const sum = addNums(5, 10);
  const product = multiplyNums(5, 10);
  console.log(sum, product);
}

main(); // ✅ works even though helpers are defined below

// helpers at bottom — still work thanks to hoisting
function addNums(a, b) { return a + b; }
function multiplyNums(a, b) { return a * b; }


// ══════════════════════════════════════════════════════════════════
// § 5 — FUNCTION EXPRESSION HOISTING
// ══════════════════════════════════════════════════════════════════
//
// Function EXPRESSIONS are NOT fully hoisted.
// The variable name is hoisted (as undefined for var, or TDZ for let/const),
// but the function body is NOT.

// ── Using var for function expression ────────────────────────────
// greetUser(); // ❌ TypeError: greetUser is not a function
//              // var greetUser was hoisted as undefined
//              // calling undefined() → TypeError
var greetUser = function(name) {
  return `Hello, ${name}!`;
};
console.log(greetUser("Alice")); // ✅ "Hello, Alice!"

// ── Using const for function expression (recommended) ────────────
// sendEmail(); // ❌ ReferenceError (TDZ — const not initialized yet)
const sendEmail = (to) => {
  console.log(`Sending email to ${to}`);
};
sendEmail("bob@example.com"); // ✅

// ── Arrow functions: same as const expression ────────────────────
// calculate(); // ❌ ReferenceError
const calculate = (x, y) => x * y;
console.log(calculate(4, 5)); // 20


// ══════════════════════════════════════════════════════════════════
// § 6 — CLASS HOISTING (bonus — asked at senior level)
// ══════════════════════════════════════════════════════════════════
//
// Classes are hoisted but NOT initialized — exactly like let/const (TDZ).
// You CANNOT use a class before its declaration.

// const obj = new Animal(); // ❌ ReferenceError: Cannot access 'Animal' before init

class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return `${this.name} makes a sound.`;
  }
}

const dog = new Animal("Rex"); // ✅
console.log(dog.speak());      // "Rex makes a sound."

// This is different from function declarations (which ARE fully hoisted).
// Interviewers love testing this distinction.


// ══════════════════════════════════════════════════════════════════
// § 7 — HOISTING INSIDE FUNCTIONS
// ══════════════════════════════════════════════════════════════════
//
// Remember: var is function-scoped.
// Hoisting happens at the TOP of the NEAREST function — not global top.

function outer() {
  console.log(innerVar); // undefined (hoisted to top of outer(), not global)
  
  function inner() {
    var innerVar = "I only belong to inner()";
  }
  
  // Wait — innerVar above is actually var inside inner(), not outer()!
  // Let's redo this correctly:
  
  console.log(localVar); // undefined — hoisted to top of outer()
  
  if (true) {
    var localVar = "I'm var inside if — but hoisted to outer()";
  }
  
  console.log(localVar); // "I'm var inside if — but hoisted to outer()"
}
outer();


// ══════════════════════════════════════════════════════════════════
// § 8 — COMMON HOISTING BUGS IN REAL CODE
// ══════════════════════════════════════════════════════════════════

// ── Bug 1: Using var before assignment in conditionals ───────────
function processOrder(isPremium) {
  console.log(discount); // undefined — not the 0 you'd expect!
  
  if (isPremium) {
    var discount = 20;
  }
  
  // If isPremium is false, discount is still undefined (not 0, not "missing")
  const finalPrice = 100 - (discount || 0); // have to add || 0 to avoid NaN
  console.log(finalPrice);
}
processOrder(false);  // 100 (but discount was undefined, not missing)
processOrder(true);   // 80

// ── Bug 2: Accidentally overwriting a function with var ──────────
function init() {
  console.log(typeof setup); // "function" — hoisted
  
  if (false) {
    // This block NEVER runs — but var setup is still hoisted!
    var setup = "string value";
    // If this ran, it would overwrite the hoisted function declaration below
  }
  
  function setup() {
    console.log("Setup running!");
  }
  
  setup(); // ✅ works here, but can get confusing
}
init();

// ── Fix: Always use let/const + function expressions ─────────────
function initSafe() {
  // const setup; // ← TDZ would protect you
  const setup = () => console.log("Safe setup!");
  setup(); // ✅ clear and predictable
}
initSafe();


// ══════════════════════════════════════════════════════════════════
// § 9 — HOISTING SUMMARY TABLE
// ══════════════════════════════════════════════════════════════════
//
//  ┌───────────────────────┬──────────┬─────────────────────────────┐
//  │ Declaration Type      │ Hoisted? │ Initial Value               │
//  ├───────────────────────┼──────────┼─────────────────────────────┤
//  │ var x                 │   ✅ Yes  │ undefined                   │
//  │ let x                 │   ✅ Yes  │ <uninitialized> (TDZ)       │
//  │ const x               │   ✅ Yes  │ <uninitialized> (TDZ)       │
//  │ function foo() {}     │   ✅ Yes  │ Full function body          │
//  │ var foo = function(){} │  ✅ Yes  │ undefined (func body stays) │
//  │ const foo = () => {}  │   ✅ Yes  │ <uninitialized> (TDZ)       │
//  │ class Foo {}          │   ✅ Yes  │ <uninitialized> (TDZ)       │
//  └───────────────────────┴──────────┴─────────────────────────────┘


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is hoisting in JavaScript? ──────────────────────────
//
// Hoisting is the result of JS's two-phase execution. In the compilation
// phase, all declarations (var, let, const, function) are registered in
// memory before any code runs. In execution phase, assignments happen
// in order. For var, the declaration is initialized to undefined. For
// let/const, the declaration exists but is uninitialized (TDZ). Function
// declarations are fully hoisted — name and body both.

// ── Q2. What is the output and why? ─────────────────────────────
//
//   console.log(a); // ?
//   var a = 5;
//   console.log(a); // ?
//
// Answer: undefined, then 5.
// `var a` is hoisted and initialized to undefined.
// Assignment `a = 5` runs at execution time.

// ── Q3. What is the output and why? ─────────────────────────────
//
//   console.log(b);
//   let b = 5;
//
// Answer: ReferenceError: Cannot access 'b' before initialization.
// `let b` is hoisted but in TDZ. Accessing it before the declaration
// line throws. This is intentional — better than silent undefined.

// ── Q4. Can you call a function before it's defined? ────────────
//
// Yes, IF it's a function DECLARATION.
// Function declarations are fully hoisted — name and body both.
// Function expressions (var/let/const = function) are NOT fully
// hoisted — calling them before the line throws TypeError or ReferenceError.

// ── Q5. What's the difference in hoisting between
//        function declarations and function expressions? ──────────
//
// Declaration: `function foo() {}` → fully hoisted, callable before definition.
// Expression:  `var foo = function() {}` → var is hoisted as undefined,
//               calling foo() before the assignment → TypeError.
// Expression:  `const foo = () => {}` → in TDZ, calling before → ReferenceError.

// ── Q6. Are classes hoisted? ─────────────────────────────────────
//
// Yes, but like let/const — they are in the TDZ.
// You cannot instantiate a class before its declaration.
// This is different from function declarations which ARE fully hoisted.

// ── Q7. What is the output? ──────────────────────────────────────
//
//   var x = 1;
//   function test() {
//     console.log(x);
//     var x = 2;
//   }
//   test();
//
// Answer: undefined
// Inside test(), `var x` is hoisted to the top of the function.
// So it shadows the outer x=1, but before assignment it's undefined.

// ── Q8. How do you avoid hoisting-related bugs? ──────────────────
//
// 1. Always use let/const — TDZ gives you a clear error instead of silent undefined.
// 2. Always declare variables at the TOP of their scope, before use.
// 3. Use function expressions with const instead of function declarations
//    when you don't need the function to be callable before its definition.
// 4. Enable strict mode — `"use strict"` — it prevents some var-related sloppiness.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 03_temporal-dead-zone.js
// ══════════════════════════════════════════════════════════════════
