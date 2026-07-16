// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  06_variable-shadowing.js                ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What variable shadowing is and how it works
//    • Where it helps (intentional shadowing)
//    • Where it hurts (accidental shadowing bugs)
//    • Shadowing with var vs let/const
//    • Shadowing in closures, callbacks, loops
//    • TDZ + shadowing trick question
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS VARIABLE SHADOWING?
// ══════════════════════════════════════════════════════════════════
//
// Shadowing = declaring a variable in an INNER scope with the SAME NAME
//             as a variable in an OUTER scope.
//
// The inner variable "shadows" (hides) the outer one.
// Within the inner scope: inner variable wins.
// After the inner scope ends: outer variable is unchanged.
//
// It does NOT modify the outer variable.
// It creates a NEW, SEPARATE binding that happens to share a name.

const theme = "dark";   // outer

function renderButton() {
  const theme = "light"; // shadows outer `theme` inside this function
  console.log(theme);    // "light" ← inner wins
}

renderButton();
console.log(theme); // "dark" ← outer completely untouched


// ══════════════════════════════════════════════════════════════════
// § 2 — HOW SHADOWING WORKS AT EVERY SCOPE LEVEL
// ══════════════════════════════════════════════════════════════════

const level = "global";

function outer() {
  const level = "outer-function"; // shadows global

  function inner() {
    const level = "inner-function"; // shadows outer-function
    console.log(level); // "inner-function" ← innermost wins
  }

  inner();
  console.log(level); // "outer-function" ← outer's copy
}

outer();
console.log(level); // "global" ← global copy untouched

// ── Block-level shadowing ────────────────────────────────────────
let status = "idle";        // outer

{
  let status = "running";   // shadows outer (block scope)
  console.log(status);      // "running"
  
  {
    let status = "paused";  // shadows again (deeper block)
    console.log(status);    // "paused"
  }
  
  console.log(status);      // "running" — restored after inner block
}

console.log(status);        // "idle" — outer never changed


// ══════════════════════════════════════════════════════════════════
// § 3 — var SHADOWING vs let/const SHADOWING
// ══════════════════════════════════════════════════════════════════

// ── var can shadow inside a function ────────────────────────────
var appName = "MyApp";

function changeApp() {
  var appName = "OtherApp"; // ✅ shadows, but only function-scoped
  console.log(appName);     // "OtherApp"
}
changeApp();
console.log(appName); // "MyApp" ← unchanged ✅

// ── var CANNOT shadow inside a plain block (same function scope!) ─
var counter = 10;
{
  var counter = 99; // ❌ NOT shadowing — this MODIFIES the same `counter`!
  // Because var ignores blocks, this is the SAME variable
  console.log(counter); // 99
}
console.log(counter); // 99 ← CHANGED! No shadowing — overwritten!

// This is why var is dangerous: you THINK you're shadowing, but you're
// actually modifying the outer variable. let/const don't have this problem.

// ── let CORRECTLY shadows inside any block ────────────────────────
let pageCount = 10;
{
  let pageCount = 99; // ✅ creates a NEW binding (block-scoped)
  console.log(pageCount); // 99 (inner)
}
console.log(pageCount); // 10 ← correctly untouched


// ══════════════════════════════════════════════════════════════════
// § 4 — INTENTIONAL SHADOWING (GOOD USES)
// ══════════════════════════════════════════════════════════════════

// ── Use case 1: Renaming imported modules locally ─────────────────
// import { map } from 'lodash';
// function myFunction() {
//   const map = new Map(); // shadows lodash's `map` inside this function
//   map.set("key", "value");
// }

// ── Use case 2: Keeping test data separate from production vars ──
const userData = { name: "Alice", role: "admin" };

function testPermissions() {
  const userData = { name: "TestUser", role: "guest" }; // test data
  console.log(userData.role); // "guest" — isolated test
}
testPermissions();
console.log(userData.role); // "admin" — production data safe

// ── Use case 3: error variable in catch ──────────────────────────
function handleRequest() {
  let error = null; // outer

  try {
    JSON.parse("invalid JSON");
  } catch (error) { // ← shadows outer `error` — this is INTENTIONAL in JS
    console.log("Caught:", error.message); // SyntaxError message
    // This `error` only lives in the catch block
  }

  console.log("outer error:", error); // null ← outer untouched ✅
}
handleRequest();

// ── Use case 4: shadowing in array/loop callbacks ─────────────────
const items = ["a", "b", "c"];
const item  = "global item"; // outer

items.forEach(item => { // ← parameter `item` shadows outer `item`
  console.log(item);    // "a", "b", "c" — correctly uses loop variable
});

console.log(item); // "global item" ← outer untouched ✅


// ══════════════════════════════════════════════════════════════════
// § 5 — ACCIDENTAL SHADOWING (BAD — causes bugs)
// ══════════════════════════════════════════════════════════════════

// ── Bug 1: Forgetting outer variable exists ───────────────────────
let isLoggedIn = true;  // auth state

function renderDashboard() {
  if (true) {
    let isLoggedIn = false; // ← ACCIDENTAL shadow — programmer forgot outer exists
    // Now they think the user is logged out — but only in this block
    console.log("Is logged in:", isLoggedIn); // false — WRONG!
  }
  console.log("Outer isLoggedIn:", isLoggedIn); // true — outer unchanged
}
renderDashboard();

// ── Bug 2: Shadowing in nested callbacks ─────────────────────────
function processData(data) {
  const result = [];  // intended outer result

  data.forEach(item => {
    const result = item * 2; // ← ACCIDENTALLY shadows outer result!
    // This `result` is local to callback — the outer result.push() is never reached!
  });

  return result; // always empty — the push should have been here
}

// Fix:
function processDataFixed(data) {
  const result = [];
  data.forEach(item => {
    result.push(item * 2); // ← uses outer `result`, no shadowing
  });
  return result;
}
console.log(processDataFixed([1, 2, 3])); // [2, 4, 6] ✅

// ── Bug 3: Shadowing function parameters ─────────────────────────
function multiply(x, y) {
  if (typeof x !== "number") {
    let x = 0; // ← shadows the parameter x! Unintentional.
    // The programmer meant to reassign x, but used let = created new variable
    // `x` parameter is unchanged and still NaN-risky
  }
  return x * y; // uses the PARAMETER x, not the let x above
}
console.log(multiply("oops", 5)); // NaN — bug! let x inside if was a shadow

// Fix: don't shadow parameters:
function multiplyFixed(x, y) {
  const safeX = typeof x === "number" ? x : 0;
  return safeX * y;
}
console.log(multiplyFixed("oops", 5)); // 0 ✅


// ══════════════════════════════════════════════════════════════════
// § 6 — TDZ + SHADOWING TRICK (top interview trap)
// ══════════════════════════════════════════════════════════════════

let tricky = "outer";

function trickyDemo() {
  // You EXPECT this to print "outer" (from outer scope).
  // But inner `let tricky` is HOISTED for this function block.
  // So `tricky` is in TDZ here — JS won't look outside.

  // console.log(tricky); // ❌ ReferenceError — inner tricky in TDZ!

  let tricky = "inner"; // TDZ ends here
  console.log(tricky);  // "inner" ✅
}
trickyDemo();
console.log(tricky); // "outer" ✅

// If inner let didn't exist:
function noShadow() {
  console.log(tricky); // ✅ "outer" — walks up scope chain
}
noShadow(); // "outer" — no shadow, finds outer variable


// ══════════════════════════════════════════════════════════════════
// § 7 — HOW TO AVOID ACCIDENTAL SHADOWING
// ══════════════════════════════════════════════════════════════════
//
// 1. Use ESLint with `no-shadow` rule — it warns on ALL shadowing.
//    Configure exceptions for intentional cases like `error` in catch.
//
// 2. Use descriptive, unique variable names:
//    Don't: const data = ...  inside a function that also has outer data
//    Do:    const userData = ... or const responseData = ...
//
// 3. Avoid deeply nested functions — the more nesting, the higher
//    the chance of accidentally using the same name.
//
// 4. ESLint no-shadow config example:
//    "no-shadow": ["error", { "allow": ["error", "resolve", "reject"] }]


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is variable shadowing? ─────────────────────────────
//
// Declaring a variable in an inner scope with the same name as an
// outer scope variable. The inner variable "shadows" the outer during
// its scope. The outer variable is NOT modified — they are completely
// separate bindings that happen to share a name.

// ── Q2. Is shadowing the same as overwriting? ───────────────────
//
// No. Shadowing creates a NEW binding in an inner scope. The outer
// variable still exists and is unchanged after the inner scope ends.
// Overwriting modifies the same variable. With var inside a block,
// you might THINK you're shadowing but you're actually overwriting
// because var ignores block boundaries.

// ── Q3. What is the output? ─────────────────────────────────────
//
//   let x = "global";
//   {
//     console.log(x); // ?
//     let x = "block";
//   }
//
// Answer: ReferenceError.
// Inner `let x` is hoisted for the block, creating TDZ from block start.
// console.log(x) is inside TDZ of inner x. JS doesn't look outside.

// ── Q4. When is shadowing GOOD? ──────────────────────────────────
//
// When you intentionally want a local copy with the same logical name:
// - catch(error) shadows outer error variable
// - forEach(item => {}) shadows outer item variable
// - Test setup with same variable name as production (isolated)
// - Locally renaming an import that conflicts with your naming convention

// ── Q5. How does ESLint help with shadowing? ─────────────────────
//
// The `no-shadow` ESLint rule warns when any variable in an inner scope
// shares a name with an outer scope variable. You can configure allowed
// exceptions (like `error` in catch blocks). This catches accidental
// shadowing at development time before it causes runtime bugs.

// ── Q6. var shadowing vs let shadowing — what's the difference? ─
//
// var only shadows at the function level. Inside a block (if/for),
// var does NOT shadow — it modifies the same outer variable because
// var ignores block scope. let/const shadow correctly in any block.
// This is why var is dangerous: `var x = 99` inside an if block
// modifies the outer x instead of creating a shadow.

// ── Q7. Is it possible to access a shadowed outer variable? ──────
//
// Not directly within the inner scope where shadowing occurs.
// But you can: 1) Save a reference to the outer variable before
// entering the inner scope. 2) Use a module to export the outer value.
// 3) Restructure your code to avoid needing both in the same place.
//
// Example of saving reference:
//   const outerVal = myVar;        // save before entering inner scope
//   function inner() {
//     const myVar = "inner";       // shadows outer myVar
//     console.log(outerVal);       // ✅ still accessible via saved ref
//   }

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 07_lexical-scoping.js
// ══════════════════════════════════════════════════════════════════
