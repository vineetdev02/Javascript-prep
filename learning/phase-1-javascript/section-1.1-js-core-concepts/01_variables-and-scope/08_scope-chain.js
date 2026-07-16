// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  08_scope-chain.js                       ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What the scope chain is and how JS builds it
//    • The variable lookup algorithm (step by step)
//    • What happens when a variable is NOT found
//    • Scope chain with closures
//    • Performance implications of long scope chains
//    • How the scope chain differs from the prototype chain
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS THE SCOPE CHAIN?
// ══════════════════════════════════════════════════════════════════
//
// The scope chain is the ORDERED LIST of scopes that JS searches
// when it needs to resolve a variable name.
//
// Think of it like this:
//   You work in a room (your scope).
//   You need to find a document.
//   You check YOUR desk first.
//   If not there → check YOUR office.
//   If not there → check the FLOOR's shared room.
//   If not there → check the BUILDING's archive.
//   If not there → "document not found" (ReferenceError).
//
// In JS terms:
//   Current scope → Parent scope → Grandparent scope → ... → Global scope → ReferenceError
//
// The chain is FIXED at the time the function is DEFINED (lexical scoping).
// It NEVER changes at runtime.


// ══════════════════════════════════════════════════════════════════
// § 2 — THE VARIABLE LOOKUP ALGORITHM
// ══════════════════════════════════════════════════════════════════
//
// When JS encounters a variable name `x`, it does this:
//
//   Step 1: Is `x` in the CURRENT scope? → Use it.
//   Step 2: Is `x` in the PARENT scope?  → Use it.
//   Step 3: Is `x` in the GRANDPARENT?   → Use it.
//   ... keep going up ...
//   Step N: Is `x` in GLOBAL scope?      → Use it.
//   Not found anywhere → ReferenceError: x is not defined
//
// JS always finds the CLOSEST match and stops there.
// It never skips a scope or jumps past a match.

const globalVar = "I'm in global scope";  // Step N

function outerFn() {
  const outerVar = "I'm in outerFn scope"; // Step 2 (for innerFn)

  function innerFn() {
    const innerVar = "I'm in innerFn scope"; // Step 1

    console.log(innerVar);  // Step 1: found immediately ✅
    console.log(outerVar);  // Step 2: not in inner → found in outer ✅
    console.log(globalVar); // Step 3: not in inner, not in outer → found in global ✅
  }

  innerFn();
  // console.log(innerVar); // ❌ ReferenceError — inner scope NOT in outer's chain
}
outerFn();
// console.log(outerVar); // ❌ ReferenceError — not in global scope


// ══════════════════════════════════════════════════════════════════
// § 3 — SCOPE CHAIN IN PRACTICE: STEP BY STEP
// ══════════════════════════════════════════════════════════════════

const company = "TechCorp";      // [Level 0: Global]

function department() {
  const dept = "Engineering";   // [Level 1: department]

  function team() {
    const teamName = "Frontend"; // [Level 2: team]

    function developer() {
      const devName = "Alice";  // [Level 3: developer]

      // Lookup chain when accessing each variable inside developer():
      // devName  → Level 3 (own scope)            ✅ found immediately
      // teamName → Level 3? No. Level 2? Yes.     ✅ found in team
      // dept     → Level 3? No. 2? No. Level 1?   ✅ found in department
      // company  → L3? L2? L1? Level 0 (global)?  ✅ found in global

      console.log(`${devName} works on ${teamName} at ${dept}, ${company}`);
      // "Alice works on Frontend at Engineering, TechCorp"
    }

    developer();
  }

  team();
}

department();


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT HAPPENS WHEN A VARIABLE IS NOT FOUND?
// ══════════════════════════════════════════════════════════════════

function lookupFail() {
  const local = "I exist";
  // console.log(nonExistent); // ❌ ReferenceError: nonExistent is not defined
  // JS looked through: lookupFail scope → global scope → NOT FOUND → Error
}
lookupFail();

// ── READ vs WRITE behavior difference ────────────────────────────
// READ  an undeclared variable → ReferenceError (always)
// WRITE to an undeclared variable → creates global (sloppy mode) or ReferenceError (strict)

function writeTest() {
  // "use strict"; // ← uncomment to get ReferenceError on line below
  // undeclaredWrite = "oops"; // sloppy: creates global. strict: ReferenceError
}

// Always use "use strict" to make write to undeclared → ReferenceError.


// ══════════════════════════════════════════════════════════════════
// § 5 — SCOPE CHAIN WITH CLOSURES
// ══════════════════════════════════════════════════════════════════
//
// When a function is returned, its scope chain travels WITH it.
// Even after the outer function is gone from the call stack,
// the scope chain persists in memory for the closure.

function bankVault(initialBalance) {
  let balance = initialBalance; // [Level 1: bankVault scope]
  const PIN = "1234";           // [Level 1: bankVault scope]

  return {
    deposit(amount) {
      // Scope chain: deposit → bankVault → global
      // `balance` found at Level 1
      balance += amount;
      console.log(`Deposited ${amount}. Balance: ${balance}`);
    },
    withdraw(amount, pin) {
      // Scope chain: withdraw → bankVault → global
      // `PIN` found at Level 1
      if (pin !== PIN) {
        console.log("Wrong PIN!");
        return;
      }
      balance -= amount;
      console.log(`Withdrew ${amount}. Balance: ${balance}`);
    },
    checkBalance(pin) {
      if (pin !== PIN) return "Wrong PIN!";
      return balance; // `balance` via scope chain
    }
  };
}

const myAccount = bankVault(1000);
myAccount.deposit(500);          // Deposited 500. Balance: 1500
myAccount.withdraw(200, "1234"); // Withdrew 200. Balance: 1300
console.log(myAccount.checkBalance("1234")); // 1300


// ══════════════════════════════════════════════════════════════════
// § 6 — SCOPE CHAIN vs PROTOTYPE CHAIN (important distinction)
// ══════════════════════════════════════════════════════════════════
//
// These are TWO different chains in JavaScript. Confusing them = instant
// failure in senior interviews.
//
// SCOPE CHAIN:
//   • Used for: variable resolution (identifiers like `myVar`, `myFn`)
//   • Determined at: WRITE time (lexical / static)
//   • Travels up: enclosing scopes → global scope
//   • Failure: ReferenceError
//
// PROTOTYPE CHAIN:
//   • Used for: property lookup on OBJECTS (`obj.property`)
//   • Determined at: RUNTIME (dynamic)
//   • Travels up: __proto__ → Object.prototype → null
//   • Failure: returns `undefined` (NOT an error)

const obj = { x: 1 };
// Property `y` not on obj → prototype chain lookup → undefined (no error)
console.log(obj.y);    // undefined (prototype chain, not an error)

// Variable `y` not in any scope → ReferenceError
// console.log(y);    // ❌ ReferenceError (scope chain, throws)


// ══════════════════════════════════════════════════════════════════
// § 7 — SCOPE CHAIN PERFORMANCE
// ══════════════════════════════════════════════════════════════════
//
// Variable lookup is FAST — JS engines optimize it heavily.
// BUT: deeper scope chains require more lookups.
// In practice, the difference is negligible for normal code.
// BUT: in extremely tight loops (millions of iterations), accessing
// a global from deep inside 5-6 nested functions CAN be slower than
// caching the global in a local variable.

// ── Micro-optimization pattern (rarely needed but worth knowing) ─
const MATH_PI = Math.PI; // cache global Math.PI in local scope

function computeCircumferences(radii) {
  const localPI = MATH_PI; // local lookup is faster than global in hot loops
  return radii.map(r => 2 * localPI * r);
}

// In modern JS engines, this optimization is usually done for you.
// Mention it in interviews as "awareness of scope chain performance"
// but don't over-optimize prematurely.


// ══════════════════════════════════════════════════════════════════
// § 8 — SCOPE CHAIN VISUAL (for review)
// ══════════════════════════════════════════════════════════════════
//
//  ┌─────────────────────────────────────────────────────────────┐
//  │  GLOBAL SCOPE                                               │
//  │  (company, department, team)                                │
//  │                                                             │
//  │  ┌───────────────────────────────────────────────────────┐  │
//  │  │  department() SCOPE                                   │  │
//  │  │  (dept)                                               │  │
//  │  │                                                       │  │
//  │  │  ┌─────────────────────────────────────────────────┐  │  │
//  │  │  │  team() SCOPE                                   │  │  │
//  │  │  │  (teamName)                                     │  │  │
//  │  │  │                                                 │  │  │
//  │  │  │  ┌───────────────────────────────────────────┐  │  │  │
//  │  │  │  │  developer() SCOPE                        │  │  │  │
//  │  │  │  │  (devName)                                │  │  │  │
//  │  │  │  │  ← lookup goes outward if not found here  │  │  │  │
//  │  │  │  └───────────────────────────────────────────┘  │  │  │
//  │  │  └─────────────────────────────────────────────────┘  │  │
//  │  └───────────────────────────────────────────────────────┘  │
//  └─────────────────────────────────────────────────────────────┘


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is the scope chain? ─────────────────────────────────
//
// The scope chain is the ordered list of scopes JS searches when
// resolving a variable. Starting from the current scope, it moves
// outward to parent, grandparent, and finally global scope. If the
// variable isn't found anywhere, a ReferenceError is thrown. The chain
// is determined at write time (lexical) and never changes at runtime.

// ── Q2. What order does JS search the scope chain? ──────────────
//
// Current scope first. If not found, parent scope. Then grandparent.
// Continues until global scope. If not found in global → ReferenceError.
// JS always stops at the FIRST match — it never skips a scope.

// ── Q3. What is the difference between scope chain and prototype chain?
//
// Scope chain: for variable resolution. Determined at write time (lexical).
// Goes through enclosing scopes. Not found → ReferenceError.
// Prototype chain: for object property lookup. Determined at runtime.
// Goes through __proto__ links. Not found → returns undefined (no error).

// ── Q4. Can inner scopes access outer scope variables? ──────────
//
// Yes. This is the entire purpose of the scope chain. Inner functions
// can read outer variables. But the reverse is NOT true — outer scopes
// cannot access inner scope variables. The chain only goes OUTWARD.

// ── Q5. What happens when JS can't find a variable? ─────────────
//
// ReferenceError: x is not defined.
// Exception: in sloppy mode, WRITING to an undeclared variable creates
// an implicit global instead of throwing. Use "use strict" to prevent this.

// ── Q6. What is a closure in terms of the scope chain? ──────────
//
// A closure is when a function retains a reference to its outer scope
// chain even after the outer function has finished executing. The
// inner function's scope chain persists in memory, allowing it to
// access outer variables long after they'd otherwise be garbage collected.

// ── Q7. Does the scope chain ever change at runtime? ────────────
//
// No. The scope chain is fixed at definition time (lexical scoping).
// You can see the entire scope chain just by reading the source code —
// no need to run it. The CALL STACK changes at runtime, but the
// scope chain of a function is immutable from the moment it's created.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 09_closures.js  ← The grand finale
// ══════════════════════════════════════════════════════════════════
