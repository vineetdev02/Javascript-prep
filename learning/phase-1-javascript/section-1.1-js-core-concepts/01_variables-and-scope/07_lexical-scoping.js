// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  07_lexical-scoping.js                   ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What "lexical" means and why it matters
//    • Lexical scope vs dynamic scope (and why JS uses lexical)
//    • How lexical scope creates closures
//    • Why "where you DEFINE" beats "where you CALL"
//    • Arrow functions and lexical `this` (scope connection)
//    • Real-world examples that trip developers
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT DOES "LEXICAL" MEAN?
// ══════════════════════════════════════════════════════════════════
//
// "Lexical" comes from "lexicon" — the words/text of the program.
// Lexical scoping means: scope is determined by WHERE the code is
// WRITTEN in the source file — NOT by where it is called at runtime.
//
// In plain English:
//   A function can access variables from the place where it was DEFINED.
//   It does NOT matter from where it is INVOKED.
//
// JavaScript is LEXICALLY SCOPED (also called "statically scoped").
// The scope is fixed at write time. You can determine it just by reading the code.
//
// Contrast with DYNAMIC SCOPING (used in Bash, some Lisp dialects):
//   In dynamic scoping, a function accesses variables from the place
//   it was CALLED, not where it was defined. JS does NOT do this.


// ══════════════════════════════════════════════════════════════════
// § 2 — THE CORE PRINCIPLE: DEFINITION OVER CALL SITE
// ══════════════════════════════════════════════════════════════════

// ── Example 1: Basic lexical scoping ────────────────────────────
const language = "JavaScript"; // defined in global scope

function printLanguage() {
  // printLanguage was DEFINED in global scope
  // So it "sees" the global `language` variable
  console.log(language); // "JavaScript"
}

function differentScope() {
  const language = "Python"; // local — does NOT affect printLanguage
  printLanguage();            // still prints "JavaScript" — not "Python"!
}

differentScope(); // "JavaScript"  ← lexical scope wins

// WHY? printLanguage was DEFINED in the global scope, where language = "JavaScript".
// Even though it was CALLED from differentScope where language = "Python",
// it still uses its OWN lexical environment.


// ══════════════════════════════════════════════════════════════════
// § 3 — DYNAMIC SCOPING VS LEXICAL SCOPING (conceptual comparison)
// ══════════════════════════════════════════════════════════════════

// If JavaScript used DYNAMIC scoping (it doesn't), this would happen:
//
//   const x = "global";
//   function readX() { console.log(x); }
//   function setX() {
//     const x = "local"; // would be visible to readX() if dynamic scoping
//     readX();            // would print "local" in dynamic scope
//   }
//   setX(); // In dynamic scope → "local". In lexical (JS) → "global"
//
// JS uses LEXICAL → readX() always sees "global", no matter who calls it.
// This makes code PREDICTABLE and DEBUGGABLE.
// Dynamic scoping makes code harder to reason about.

const x = "global x";
function readX() { console.log(x); }
function overrideX() {
  const x = "local x"; // this does NOT affect readX()
  readX();              // lexical: still "global x"
}
overrideX(); // "global x" ✅ — lexical scoping confirmed


// ══════════════════════════════════════════════════════════════════
// § 4 — LEXICAL SCOPE AND THE SCOPE CHAIN
// ══════════════════════════════════════════════════════════════════
//
// Every function carries a "lexical environment" — a reference to
// the scope chain at the point where it was DEFINED.
// When the function runs, it uses THIS chain to look up variables.

const A = "A (global)";

function level1() {
  const B = "B (level1)";

  function level2() {
    const C = "C (level2)";

    function level3() {
      // level3's lexical env = level3 → level2 → level1 → global
      console.log(C); // found in level2 ✅
      console.log(B); // found in level1 ✅
      console.log(A); // found in global ✅
    }

    level3();
    // console.log(D); // ❌ ReferenceError — level3's scope not in level2's chain
  }

  level2();
}

level1();
// The chain is determined by WHERE functions are NESTED in the source code.
// Even if you move level3 to a different location, it keeps its original chain.


// ══════════════════════════════════════════════════════════════════
// § 5 — LEXICAL SCOPE CREATES CLOSURES
// ══════════════════════════════════════════════════════════════════
//
// Closures exist BECAUSE of lexical scoping.
// A closure is a function that REMEMBERS its lexical environment
// even after the outer function has returned.
// Without lexical scoping, closures would be impossible.

function createAdder(base) {
  // `base` is in the lexical scope of the returned function
  return function(num) {
    return base + num; // `base` is remembered via lexical scope
  };
}

const add10 = createAdder(10); // lexical env: base = 10
const add20 = createAdder(20); // lexical env: base = 20

console.log(add10(5));  // 15 — base remembered as 10
console.log(add20(5));  // 25 — base remembered as 20
console.log(add10(3));  // 13 — still 10, not affected by add20


// ══════════════════════════════════════════════════════════════════
// § 6 — LEXICAL SCOPE WITH CALLBACKS
// ══════════════════════════════════════════════════════════════════
//
// One of the most COMMON interview scenarios involving lexical scope.

const userName = "Alice";

function greetUser() {
  // greetUser was DEFINED here in global scope
  // So it has access to global `userName`
  setTimeout(function() {
    // This callback was DEFINED inside greetUser
    // It also has access to global `userName` via lexical scope
    console.log(`Hello, ${userName}!`); // "Hello, Alice!"
  }, 100);
}

greetUser(); // "Hello, Alice!" ✅

// Even after greetUser returns, the callback still accesses userName
// because it was lexically defined where userName is visible.

// ── More complex: callback accessing outer function's variable ────
function fetchUserData(userId) {
  const requestId = Math.random(); // exists in fetchUserData's scope

  fetch(`https://api.example.com/users/${userId}`)
    .then(response => response.json())
    .then(data => {
      // This callback was DEFINED inside fetchUserData
      // It lexically captures `requestId` — even though fetchUserData has returned
      console.log(`Request ${requestId}: got user ${data.name}`);
    });
}
// Both .then callbacks lexically remember `requestId` and `userId`


// ══════════════════════════════════════════════════════════════════
// § 7 — LEXICAL SCOPE AND ARROW FUNCTIONS (`this` connection)
// ══════════════════════════════════════════════════════════════════
//
// Arrow functions inherit `this` from their LEXICAL SCOPE.
// Regular functions have their OWN `this` based on HOW they're called.
// This is perhaps the most practical application of lexical scope.

const user = {
  name: "Bob",
  
  // Regular function — `this` is determined by call site (the object)
  greetRegular: function() {
    console.log("Regular:", this.name); // "Bob" ✅ (this = user)
    
    setTimeout(function() {
      // Regular function callback — `this` is now undefined (strict) or window
      console.log("Regular callback:", this?.name); // undefined or error
    }, 100);
  },
  
  // Arrow function — `this` is inherited from lexical scope (user object)
  greetArrow: function() {
    console.log("Arrow outer:", this.name); // "Bob" ✅
    
    setTimeout(() => {
      // Arrow function inherits `this` from greetArrow's lexical scope
      console.log("Arrow callback:", this.name); // "Bob" ✅ — lexical this!
    }, 100);
  },
};

user.greetRegular();
user.greetArrow();

// Arrow functions don't have their own `this`.
// They use the `this` from WHERE THEY WERE DEFINED (lexical).
// This solves the famous "this" binding problem in callbacks.


// ══════════════════════════════════════════════════════════════════
// § 8 — RETURNED FUNCTIONS KEEP THEIR LEXICAL SCOPE
// ══════════════════════════════════════════════════════════════════
//
// When you return a function from another function, the returned
// function carries its ENTIRE lexical environment with it.
// This is the core mechanism of closures.

function makeLogger(prefix) {
  // `prefix` is in the lexical scope of the returned function
  return function(message) {
    console.log(`[${prefix}] ${message}`);
    // `prefix` is remembered forever via lexical scope
  };
}

const infoLog  = makeLogger("INFO");
const errorLog = makeLogger("ERROR");
const debugLog = makeLogger("DEBUG");

// makeLogger has returned — but prefix is STILL accessible via lexical scope
infoLog("Server started");       // [INFO] Server started
errorLog("Connection refused");  // [ERROR] Connection refused
debugLog("Request received");    // [DEBUG] Request received


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is lexical scoping? ────────────────────────────────
//
// Lexical scoping means that a function's scope is determined by WHERE
// the function is WRITTEN in the source code — not where it is called.
// JavaScript is lexically scoped. When a function looks up a variable,
// it uses the scope chain from its definition point, not its call site.

// ── Q2. What's the difference between lexical and dynamic scope? ─
//
// Lexical scope (JS): scope is fixed at write time based on where code is defined.
// Dynamic scope (Bash, some Lisps): scope is determined at runtime based on
// the call stack — variables are resolved in the context of the caller.
// Lexical scoping is more predictable and easier to reason about.

// ── Q3. What is the output and why? ──────────────────────────────
//
//   const val = "global";
//   function show() { console.log(val); }
//   function fake() {
//     const val = "fake";
//     show();
//   }
//   fake();
//
// Answer: "global".
// show() was DEFINED in global scope where val = "global".
// Even though it's CALLED from fake() where val = "fake",
// lexical scope means it uses its DEFINITION environment.

// ── Q4. What is the relationship between lexical scope and closures?
//
// Closures exist because of lexical scoping. When a function is defined
// inside another function, it captures a reference to its lexical
// environment. Even after the outer function returns, the inner function
// still holds a reference to those outer variables. This is a closure.
// Without lexical scoping, closures would be impossible.

// ── Q5. Why do arrow functions have lexical `this`? ─────────────
//
// Arrow functions don't have their own `this` binding. Instead, they
// use `this` from their LEXICAL SCOPE — the `this` value of the
// nearest enclosing non-arrow function. This is why arrow functions
// are preferred for callbacks inside methods — they correctly inherit
// `this` from the surrounding code.

// ── Q6. What scope does a returned function use? ─────────────────
//
// A returned function keeps its LEXICAL scope — the scope chain from
// where it was DEFINED. Even after the outer function returns, the
// inner function still has access to outer variables. This is the
// core mechanism of closures.

// ── Q7. Is JavaScript lexically or dynamically scoped for `this`? ─
//
// Variables: lexically scoped.
// `this`: NEITHER by default — regular function `this` is determined
// dynamically by how the function is called. BUT arrow functions
// make `this` lexically scoped. This is why mixing regular and arrow
// functions in the same object can cause confusing `this` behavior.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 08_scope-chain.js
// ══════════════════════════════════════════════════════════════════
