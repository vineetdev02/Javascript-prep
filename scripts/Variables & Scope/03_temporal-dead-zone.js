// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  03_temporal-dead-zone.js                ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What TDZ is and WHY it was designed this way
//    • Where TDZ starts and where it ends
//    • TDZ with typeof (the surprising behavior)
//    • TDZ in function parameters (advanced)
//    • TDZ with classes
//    • Real bugs TDZ prevents (compared to var)
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS THE TEMPORAL DEAD ZONE?
// ══════════════════════════════════════════════════════════════════
//
// TDZ = Temporal Dead Zone
//
// It is the period of time between:
//   START  → when a block begins execution (the { )
//   END    → when the let/const/class declaration line is reached
//
// During TDZ:
//   • The variable EXISTS in scope (it was hoisted during compile)
//   • But it is UNINITIALIZED — has no value, not even undefined
//   • Any read or write attempt → ReferenceError
//
// "Temporal" = relating to time (not physical location in code)
// "Dead"     = unusable / deadly
// "Zone"     = the region of code where this applies
//
// WHY does TDZ exist?
//   Designers of ES6 wanted to prevent the silent `undefined` bug
//   that var creates. TDZ turns silent bugs into LOUD errors.
//   If you access a variable before declaring it, you SHOULD get
//   an error, not a mysterious undefined.


// ══════════════════════════════════════════════════════════════════
// § 2 — TDZ IN ACTION: BASIC DEMO
// ══════════════════════════════════════════════════════════════════

function basicTDZ() {
  // ← TDZ for `userId` STARTS HERE (beginning of function block)

  // Attempting to read inside TDZ:
  // console.log(userId); // ❌ ReferenceError: Cannot access 'userId' before init

  // Attempting to write inside TDZ:
  // userId = "temp";     // ❌ ReferenceError

  let userId = "user_001"; // ← TDZ for `userId` ENDS HERE (initialized)

  // Now it is safe:
  console.log(userId);  // ✅ "user_001"
  userId = "user_002";  // ✅ reassignment is fine (it's let, not const)
  console.log(userId);  // ✅ "user_002"
}
basicTDZ();

// Same for const:
function constTDZ() {
  // console.log(MAX); // ❌ ReferenceError (TDZ)
  const MAX = 100;    // ← TDZ ends here
  console.log(MAX);   // ✅ 100
}
constTDZ();


// ══════════════════════════════════════════════════════════════════
// § 3 — TDZ VS VAR: THE KEY DIFFERENCE
// ══════════════════════════════════════════════════════════════════

// ── var: silent undefined (dangerous) ───────────────────────────
function varBehavior() {
  console.log(name); // undefined — NO ERROR, silent wrong value
  var name = "Alice";
  console.log(name); // "Alice"
}
varBehavior();
// If you multiply undefined by 2 you get NaN.
// NaN propagates silently through calculations.
// You might not find the bug until it's in production.

// ── let/const: loud ReferenceError (safe) ────────────────────────
function letBehavior() {
  // console.log(age); // ❌ ReferenceError — LOUD, easy to find and fix
  let age = 25;
  console.log(age);   // 25
}
letBehavior();

// The TDZ is a FEATURE, not a bug.
// It catches your mistake immediately at the right line.


// ══════════════════════════════════════════════════════════════════
// § 4 — TDZ AND typeof  ← Trips even senior developers
// ══════════════════════════════════════════════════════════════════
//
// Historically: typeof undeclaredVariable === "undefined"  (safe, no error)
// In TDZ:       typeof letVariable throws ReferenceError   (SURPRISE!)
//
// This is one of the most overlooked TDZ behaviors.

// ── typeof on completely undeclared variable (safe) ──────────────
console.log(typeof neverDeclared); // ✅ "undefined"  — no error

// ── typeof on var (safe — hoisted as undefined) ───────────────────
console.log(typeof varVariable);   // ✅ "undefined"
var varVariable = "now I exist";

// ── typeof on let inside TDZ (THROWS!) ───────────────────────────
// console.log(typeof letInTDZ); // ❌ ReferenceError — even typeof!
let letInTDZ = "now I exist";
console.log(typeof letInTDZ);    // ✅ "string"

// WHY does this matter?
// Before ES6, developers used `typeof x === "undefined"` as a safe
// "does this variable exist?" check. With let/const, that pattern
// BREAKS inside TDZ. You cannot safely use typeof as an existence check
// for let/const before their declaration.


// ══════════════════════════════════════════════════════════════════
// § 5 — PROOF THAT let IS HOISTED (TDZ proves it)
// ══════════════════════════════════════════════════════════════════
//
// Some people think let is NOT hoisted. Wrong.
// The TDZ itself PROVES that let is hoisted — because JS "knows"
// about the inner declaration and refuses to look at the outer scope.
// If let weren't hoisted, JS would just look up to the outer scope.

let value = "GLOBAL";

function proveHoisting() {
  // If let were NOT hoisted here, console.log(value) would print "GLOBAL"
  // But it throws ReferenceError — because inner `let value` IS hoisted,
  // creating a TDZ for the entire function body ABOVE the declaration.

  // console.log(value); // ❌ ReferenceError (inner let value is in TDZ)
  //                     //    proves inner let was hoisted

  let value = "LOCAL"; // TDZ ends here
  console.log(value);  // "LOCAL" ✅
}
proveHoisting();
console.log(value); // "GLOBAL" ✅ — outer unchanged


// ══════════════════════════════════════════════════════════════════
// § 6 — TDZ IN FUNCTION PARAMETERS (advanced)
// ══════════════════════════════════════════════════════════════════
//
// Default parameter values are evaluated LEFT to RIGHT.
// A parameter can reference a PREVIOUS parameter, but NOT a later one.
// Using a later param as default → TDZ-like behavior.

// ── Safe: referencing previous parameter ─────────────────────────
function greet(firstName, lastName = firstName + " (no last name)") {
  console.log(firstName, lastName);
}
greet("Alice");        // "Alice  Alice (no last name)"
greet("Alice", "Bob"); // "Alice  Bob"

// ── Unsafe: referencing parameter that comes later ────────────────
// function badParams(a = b, b = 1) { // ❌ ReferenceError: b is in TDZ
//   console.log(a, b);
// }

// ── Interesting: default param accessing own name ────────────────
// function selfRef(x = x) { } // ❌ ReferenceError: x is in TDZ when
//                               //    its own default is evaluated


// ══════════════════════════════════════════════════════════════════
// § 7 — TDZ WITH CLASSES
// ══════════════════════════════════════════════════════════════════
//
// Classes behave exactly like let/const — they are in TDZ before
// their declaration. Unlike function declarations, you CANNOT
// instantiate a class before it is defined.

// const animal = new Dog(); // ❌ ReferenceError: Cannot access 'Dog' before init

class Dog {
  constructor(name, breed) {
    this.name  = name;
    this.breed = breed;
  }
  bark() {
    return `${this.name} says: Woof!`;
  }
}

const myDog = new Dog("Max", "Labrador"); // ✅ after declaration
console.log(myDog.bark()); // "Max says: Woof!"


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL-WORLD TDZ GOTCHAS
// ══════════════════════════════════════════════════════════════════

// ── Gotcha 1: Destructuring in TDZ ───────────────────────────────
// const { a, b } = getValues(); // if getValues uses a let above, TDZ
// Always declare before destructuring.

// ── Gotcha 2: Import in modules ──────────────────────────────────
// Imports are hoisted in modules, but if you have circular dependencies
// with let/const, TDZ can bite you. Classes imported before they're
// "fully evaluated" in another module can throw TDZ errors.

// ── Gotcha 3: Switch case without block ──────────────────────────
function switchTDZ(val) {
  switch(val) {
    case 1:
      let x = "case 1"; // ← this let covers the ENTIRE switch body
      console.log(x);
      break;
    case 2:
      // console.log(x); // ❌ ReferenceError — x is in TDZ in case 2!
      //                  //    x is hoisted to top of switch, but only initialized in case 1
      let y = "case 2"; // SyntaxError if same name as above without {}
      console.log(y);
      break;
  }
}
// Fix: use blocks inside each case:
function switchTDZFixed(val) {
  switch(val) {
    case 1: {
      let x = "case 1"; // x is scoped to THIS block only
      console.log(x);
      break;
    }
    case 2: {
      let x = "case 2"; // completely separate x, no conflict
      console.log(x);
      break;
    }
  }
}
switchTDZFixed(1); // "case 1"
switchTDZFixed(2); // "case 2"


// ══════════════════════════════════════════════════════════════════
// § 9 — TDZ SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// What enters TDZ:   let, const, class
// What does NOT:     var, function declarations
//
// TDZ starts:        At the opening { of the containing scope
// TDZ ends:          At the let/const/class declaration line
//
// In TDZ:            Read  → ReferenceError
//                    Write → ReferenceError
//                    typeof → ReferenceError  (unexpected!)
//
// Why it exists:     To prevent silent "use before declare" bugs
// What it replaces:  The silent `undefined` that var gave you


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is the Temporal Dead Zone? ─────────────────────────
//
// TDZ is the period between the start of a block and the line where
// a let/const/class is declared. During TDZ, the variable has been
// hoisted (registered in scope) but is uninitialized. Any access
// throws ReferenceError. It was introduced to prevent the silent
// undefined bugs that var caused.

// ── Q2. Does let get hoisted? ───────────────────────────────────
//
// Yes. Let IS hoisted to the top of its block. The TDZ proves it:
// if let weren't hoisted, JS would look up to outer scope. Instead,
// it knows there's an inner let declaration and throws ReferenceError
// because it's uninitialized. The TDZ is the gap between
// "hoisted but not yet initialized".

// ── Q3. What is the output and why? ──────────────────────────────
//
//   let x = "global";
//   function test() {
//     console.log(x);
//     let x = "local";
//   }
//   test();
//
// Answer: ReferenceError.
// Inside test(), `let x` is hoisted for the entire function body.
// console.log(x) is inside the TDZ of the inner x. JS won't look
// outside — it knows inner x exists, but it's uninitialized.

// ── Q4. What does typeof do inside TDZ? ─────────────────────────
//
// It throws ReferenceError — unlike the normal behavior where typeof
// on an undeclared variable returns "undefined". typeof is not a
// safe existence check inside a TDZ. This surprises even experienced devs.

// ── Q5. What enters the TDZ? ────────────────────────────────────
//
// let, const, and class declarations.
// var and function declarations do NOT enter TDZ.
// var is initialized to undefined. Function declarations are fully hoisted.

// ── Q6. Fix this code: ───────────────────────────────────────────
//
//   switch (action) {
//     case "login":
//       let user = getUser();
//       break;
//     case "logout":
//       let user = null;  // SyntaxError: already declared
//       break;
//   }
//
// Answer: Wrap each case in { } to create individual block scopes:
//   case "login": { let user = getUser(); break; }
//   case "logout": { let user = null; break; }

// ── Q7. Why was TDZ added to JavaScript? ────────────────────────
//
// To catch "use before declaration" bugs at the right line, loudly,
// instead of silently returning undefined like var does.
// It encourages declaring variables before using them, which is
// best practice. It also makes const meaningful — if const were
// hoisted as undefined (like var), you could read it before its
// initialization, breaking the expectation that const is always
// initialized to a real value.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 04_block-vs-function-scope.js
// ══════════════════════════════════════════════════════════════════
