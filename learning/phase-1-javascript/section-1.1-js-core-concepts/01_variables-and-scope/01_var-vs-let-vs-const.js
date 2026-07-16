// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  01_var-vs-let-vs-const.js               ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • Why JS has 3 declaration keywords
//    • Every behavioral difference with proof
//    • The classic for-loop bug and 3 ways to fix it
//    • const ≠ immutable (the trap every dev falls into)
//    • When to use which keyword (the professional rule)
//    • 10 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHY THREE KEYWORDS EXIST
// ══════════════════════════════════════════════════════════════════
//
// Before ES6 (2015):  only `var` existed.
// `var` had two silent bugs baked in:
//   Bug 1 → Leaks out of blocks  (function-scoped, not block-scoped)
//   Bug 2 → Accessible before assignment as `undefined` (hoisting)
//
// ES6 introduced `let` and `const` to fix both:
//   let   → block-scoped, TDZ prevents early access
//   const → block-scoped, TDZ, also prevents reassignment
//
// Modern rule:
//   const → use by DEFAULT
//   let   → use when you NEED to reassign
//   var   → use NEVER (unless maintaining legacy code)


// ══════════════════════════════════════════════════════════════════
// § 2 — SCOPE DIFFERENCES  ← #1 interview topic
// ══════════════════════════════════════════════════════════════════

// ── 2A. var is FUNCTION-SCOPED ─────────────────────────────────
// var does NOT respect block boundaries { }.
// It only cares about function boundaries.

function varScopeDemo() {
  if (true) {
    var blockVar = "I was declared inside the if-block";
    // var doesn't care about the { } above
  }
  console.log(blockVar); // ✅ "I was declared inside the if-block"
  //  var LEAKED out of the if-block — this is the bug!
}
varScopeDemo();

// ── 2B. let & const are BLOCK-SCOPED ───────────────────────────
// A block = anything between { }
// if, else, for, while, try, catch, or even a standalone { }

function letScopeDemo() {
  if (true) {
    let  blockLet   = "I stay in the if-block";
    const blockConst = "I stay in the if-block too";
  }
  // console.log(blockLet);   // ❌ ReferenceError
  // console.log(blockConst); // ❌ ReferenceError
  console.log("let and const correctly contained ✅");
}
letScopeDemo();

// ── 2C. var leaking from for-loops (dangerous!) ─────────────────
for (var i = 0; i < 3; i++) { /* nothing */ }
console.log("var i after loop:", i); // ✅ 3 — leaked into outer scope!

for (let j = 0; j < 3; j++) { /* nothing */ }
// console.log("let j after loop:", j); // ❌ ReferenceError — contained

// ── 2D. All three work fine inside functions ─────────────────────
function allInFunction() {
  var   a = "var";
  let   b = "let";
  const c = "const";
  console.log(a, b, c); // ✅ all visible inside function
}
allInFunction();
// console.log(a); // ❌ — function-scoped, not visible outside


// ══════════════════════════════════════════════════════════════════
// § 3 — HOISTING DIFFERENCES
// ══════════════════════════════════════════════════════════════════
//
// Hoisting = JS compile phase moves DECLARATIONS to top of their scope.
// The ASSIGNMENT stays in place. Only the declaration moves.

// ── 3A. var: hoisted + initialized as undefined ──────────────────
console.log(myVar); // ✅ undefined  (no crash — dangerous silent behavior)
var myVar = "assigned now";
console.log(myVar); // "assigned now"

// The engine sees this as:
//   var myVar = undefined;   ← hoisted
//   ...
//   myVar = "assigned now";  ← stays in place

// ── 3B. let: hoisted but NOT initialized (TDZ) ───────────────────
// console.log(myLet); // ❌ ReferenceError: Cannot access 'myLet' before initialization
let myLet = "I exist now";
console.log(myLet); // ✅

// ── 3C. const: same as let (TDZ) ─────────────────────────────────
// console.log(myConst); // ❌ ReferenceError
const myConst = "I exist now too";
console.log(myConst); // ✅

// ── 3D. Function DECLARATIONS are FULLY hoisted ──────────────────
sayHello(); // ✅ works before the function definition!
function sayHello() {
  console.log("Hello — function declaration fully hoisted!");
}

// ── 3E. Function EXPRESSIONS are NOT fully hoisted ───────────────
// sayHi(); // ❌ TypeError: sayHi is not a function
//           (var sayHi is hoisted as undefined, calling undefined() = TypeError)
var sayHi = function() {
  console.log("Hi — function expression, only works after assignment");
};
sayHi(); // ✅


// ══════════════════════════════════════════════════════════════════
// § 4 — REDECLARATION RULES
// ══════════════════════════════════════════════════════════════════

// ── var CAN be redeclared — silently overwrites! ─────────────────
var username = "Alice";
var username = "Bob";   // ✅ no error — DANGEROUS! silent overwrite
console.log(username);  // "Bob"

// Real-world danger: two developers both declare var username in
// the same file. No error. Second one wins. Bugs everywhere.

// ── let CANNOT be redeclared in same scope ───────────────────────
let email = "alice@example.com";
// let email = "bob@example.com"; // ❌ SyntaxError: Identifier 'email' already declared

// ── const CANNOT be redeclared in same scope ─────────────────────
const MAX = 100;
// const MAX = 200; // ❌ SyntaxError

// ── BUT same name IS fine in a different block scope ─────────────
let city = "Mumbai";  // outer
{
  let city = "Delhi"; // ✅ new binding in inner block (shadowing)
  console.log(city);  // "Delhi"
}
console.log(city);    // "Mumbai" — outer untouched


// ══════════════════════════════════════════════════════════════════
// § 5 — REASSIGNMENT RULES
// ══════════════════════════════════════════════════════════════════

// var: can be reassigned
var count = 0;
count = 10;
count++;
console.log(count); // 11 ✅

// let: can be reassigned
let total = 0;
total += 100;
total += 50;
console.log(total); // 150 ✅

// const: CANNOT be reassigned
const API_KEY = "abc-123-xyz";
// API_KEY = "new-key"; // ❌ TypeError: Assignment to constant variable


// ══════════════════════════════════════════════════════════════════
// § 6 — const ≠ IMMUTABLE  (the trap every dev falls into)
// ══════════════════════════════════════════════════════════════════
//
// const only locks the BINDING (pointer/reference).
// It does NOT lock the VALUE that the binding points to.
// Objects and arrays can still be MUTATED.

const user = { name: "Alice", age: 25, role: "admin" };

// Mutating properties — ALLOWED:
user.name = "Bob";         // ✅
user.age  = 26;            // ✅
user.role = "superadmin";  // ✅
delete user.role;          // ✅

console.log(user); // { name: "Bob", age: 26 }

// Reassigning the binding — NOT ALLOWED:
// user = { name: "Charlie" }; // ❌ TypeError: Assignment to constant variable

// Same with arrays:
const colors = ["red", "green"];
colors.push("blue");   // ✅ mutation allowed
colors[0] = "yellow";  // ✅ mutation allowed
// colors = ["pink"];   // ❌ TypeError

// ── HOW TO MAKE const TRULY IMMUTABLE ────────────────────────────
const CONFIG = Object.freeze({
  host: "localhost",
  port: 3000,
  debug: true,
});
CONFIG.port = 9999;    // silently ignored (or throws in strict mode)
CONFIG.newKey = "val"; // silently ignored
console.log(CONFIG.port); // still 3000

// ⚠️ Object.freeze is SHALLOW — nested objects are still mutable:
const SETTINGS = Object.freeze({
  db: { host: "localhost" } // nested object NOT frozen
});
SETTINGS.db.host = "remotehost"; // ✅ this WORKS (shallow freeze)
console.log(SETTINGS.db.host);   // "remotehost"

// Deep freeze helper (interview bonus answer):
function deepFreeze(obj) {
  Object.getOwnPropertyNames(obj).forEach(name => {
    const value = obj[name];
    if (typeof value === "object" && value !== null) {
      deepFreeze(value); // recursively freeze nested objects
    }
  });
  return Object.freeze(obj);
}

const DEEP_CONFIG = deepFreeze({ nested: { value: 42 } });
DEEP_CONFIG.nested.value = 999; // silently ignored now
console.log(DEEP_CONFIG.nested.value); // still 42 ✅


// ══════════════════════════════════════════════════════════════════
// § 7 — GLOBAL OBJECT ATTACHMENT (window)
// ══════════════════════════════════════════════════════════════════
//
// When declared at TOP LEVEL (outside all functions/blocks):
//   var   → attaches to window object  (DANGEROUS)
//   let   → does NOT attach to window
//   const → does NOT attach to window

// In a browser:
//   var globalVar = "I'm on window";
//   window.globalVar === "I'm on window"  // true
//
//   let globalLet = "safe";
//   window.globalLet === undefined         // true
//
// Danger:
//   var name = "Alice";        // overwrites window.name!
//   var location = "/home";    // overwrites window.location!
//   var history = [];          // overwrites window.history!


// ══════════════════════════════════════════════════════════════════
// § 8 — THE CLASSIC for-loop BUG  (most asked async + scope combo Q)
// ══════════════════════════════════════════════════════════════════

// ── PROBLEM with var ──────────────────────────────────────────────
for (var v = 0; v < 3; v++) {
  setTimeout(() => {
    console.log("var loop:", v); // 3, 3, 3  ❌
  }, 100);
}
// WHY? There is ONE shared `v` (function-scoped).
// By the time callbacks fire, loop finished → v === 3.
// All 3 callbacks share the SAME `v`.

// ── FIX 1: use let (new binding per iteration) ───────────────────
for (let l = 0; l < 3; l++) {
  setTimeout(() => {
    console.log("let loop:", l); // 0, 1, 2  ✅
  }, 200);
}

// WHY? let is block-scoped. Each iteration gets its OWN `l` binding.

// ── FIX 2: IIFE (old ES5 solution before let) ────────────────────
for (var v2 = 0; v2 < 3; v2++) {
  (function(captured) {
    setTimeout(() => {
      console.log("IIFE loop:", captured); // 0, 1, 2  ✅
    }, 300);
  })(v2); // capture current v2 into a new scope immediately
}

// ── FIX 3: Array method (avoids the problem entirely) ────────────
[0, 1, 2].forEach((n) => {
  setTimeout(() => {
    console.log("forEach loop:", n); // 0, 1, 2  ✅
  }, 400);
});


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN TO USE WHICH KEYWORD  (the professional standard)
// ══════════════════════════════════════════════════════════════════

// ── USE const BY DEFAULT ─────────────────────────────────────────
const API_URL    = "https://api.example.com/v1";  // config
const MAX_ITEMS  = 50;                             // magic numbers
const fetchUsers = async () => {};                 // functions
const userData   = {};                             // objects (even if mutated)
const itemList   = [];                             // arrays  (even if pushed)

// ── USE let WHEN YOU NEED TO REASSIGN ────────────────────────────
let retries = 0;
while (retries < 3) {
  retries++;  // reassignment → let is correct here
}

let message;
if (retries >= 3) {
  message = "Failed after 3 retries";
} else {
  message = "Success";
}

// ── USE var ALMOST NEVER ──────────────────────────────────────────
// Only if:
//   • Maintaining ES5 legacy code
//   • Polyfills for very old browsers
//   • You intentionally need function-scoped behavior (extremely rare)


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is the difference between var, let, and const? ──────
//
// var: function-scoped, hoisted as undefined, can be redeclared
//      and reassigned, attaches to window object at global scope.
// let: block-scoped, hoisted but in TDZ (unusable before declaration),
//      cannot be redeclared, CAN be reassigned.
// const: block-scoped, TDZ, cannot be redeclared OR reassigned,
//        but the value it holds can still be mutated if it's an object.

// ── Q2. What does "hoisted as undefined" mean for var? ────────────
//
// During the compile phase, JS registers all var declarations and
// initializes them to undefined. So reading a var before its
// assignment line returns undefined instead of throwing an error.
// This is a footgun — you get no warning that you're reading too early.

// ── Q3. Is const truly immutable? ────────────────────────────────
//
// No. const only prevents REASSIGNMENT of the binding (the pointer).
// If the value is an object or array, you can still mutate its
// contents. To make an object deeply immutable, use a recursive
// deepFreeze. Object.freeze() alone is shallow.

// ── Q4. Output of this code? ─────────────────────────────────────
//
//   for (var i = 0; i < 3; i++) {
//     setTimeout(() => console.log(i), 0);
//   }
//
// Answer: 3, 3, 3
// var is function-scoped. One shared `i`. Loop ends → i=3.
// All callbacks close over the same `i`. Fix: use let.

// ── Q5. What is the difference between let and var in a for loop? ─
//
// var: creates one binding for the entire loop (function-scoped).
// let: creates a NEW binding for each iteration (block-scoped).
// This matters enormously when async code (setTimeout, Promises)
// is used inside the loop.

// ── Q6. Can you redeclare a variable with let? ────────────────────
//
// No. Redeclaring with let in the same scope gives SyntaxError.
// But you CAN declare a same-named let in a DIFFERENT (inner) scope
// — that's called variable shadowing.

// ── Q7. Why should you never use var for naming window properties? ─
//
// Global var declarations become properties of the window object.
// Names like `name`, `location`, `history`, `status`, `document`
// already exist on window — var will silently overwrite them,
// causing hard-to-trace bugs. let/const don't touch window.

// ── Q8. What happens here? (trick — TDZ + shadowing) ─────────────
//
//   let x = 1;
//   {
//     console.log(x); // ???
//     let x = 2;
//   }
//
// Answer: ReferenceError!
// You expect it to print 1 (from outer x), but inner `let x`
// creates a new binding for the ENTIRE block including lines BEFORE
// the declaration. So console.log(x) is in the TDZ of the inner x.
// JS never "looks outside" when it knows there's an inner declaration.

// ── Q9. Can const be used in a for...of loop? ────────────────────
//
// Yes. Each iteration of for...of creates a fresh binding, so
// const works perfectly. You can NOT use const in a classic
// for(;;) loop because the counter needs i++ (reassignment).

// ── Q10. What is the temporal dead zone for const specifically? ───
//
// Same as let. From the start of the block to the const declaration
// line. Accessing it in that window throws ReferenceError.
// const ALSO requires initialization at declaration — `const x;`
// is a SyntaxError (unlike var/let which allow uninitialized).

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 02_hoisting.js
// ══════════════════════════════════════════════════════════════════
