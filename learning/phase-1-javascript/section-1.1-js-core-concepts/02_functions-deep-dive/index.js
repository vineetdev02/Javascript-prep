// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL         ║
// ║             ◆ Functions Deep Dive — MASTER INDEX                ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 📁 FOLDER : Functions_Deep_Dive/
// 📄 FILE   : index.js  ← START HERE every session
// 🎯 GOAL   : Big picture of all 12 topics. Short intro + code.
//             Deep dives are in the numbered files.
//
// ══════════════════════════════════════════════════════════════════
// 🗺️  FOLDER STRUCTURE
// ══════════════════════════════════════════════════════════════════
//
//  Functions_Deep_Dive/
//  ├── index.js                          ← YOU ARE HERE
//  ├── 01_declaration-vs-expression.js
//  ├── 02_arrow-vs-regular-function.js
//  ├── 03_iife-pattern.js
//  ├── 04_higher-order-functions.js
//  ├── 05_pure-functions.js
//  ├── 06_first-class-functions.js
//  ├── 07_currying.js
//  ├── 08_partial-application.js
//  ├── 09_function-composition.js
//  ├── 10_default-parameters.js
//  ├── 11_rest-and-spread.js
//  └── 12_arguments-object.js
//
// ══════════════════════════════════════════════════════════════════
// 📌 POINT 1 — Function Declaration vs Expression
// ══════════════════════════════════════════════════════════════════
// Declaration  → hoisted fully, callable before definition
// Expression   → NOT fully hoisted (TDZ or undefined), name is optional
// Arrow        → always an expression, no `this`, no `arguments`

function declared() { return "declaration — fully hoisted"; }
const expressed = function() { return "expression — NOT fully hoisted"; };
const arrowed   = () => "arrow expression";

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 2 — Arrow Function vs Regular Function
// ══════════════════════════════════════════════════════════════════
// Key differences:
//   1. `this` binding     → arrow: lexical | regular: call-site
//   2. `arguments` object → arrow: NO      | regular: YES
//   3. `new` keyword      → arrow: ❌ cannot be constructor
//   4. `prototype`        → arrow: NO      | regular: YES
//   5. Syntax             → arrow: concise, implicit return

const obj = {
  name: "Alice",
  regularMethod: function() { return this.name; }, // "Alice" ✅
  arrowMethod:   ()         => "has no own this",  // undefined ❌ (in methods)
};

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 3 — IIFE Pattern
// ══════════════════════════════════════════════════════════════════
// IIFE = Immediately Invoked Function Expression
// Run once, scope contained, never accessible again.
// Used for: init code, private scope, avoiding global pollution.

const result = (function() {
  const privateVar = "hidden";
  return privateVar.toUpperCase();
})();
console.log(result); // "HIDDEN" — no global pollution

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 4 — Higher-Order Functions
// ══════════════════════════════════════════════════════════════════
// A function that TAKES a function as argument OR RETURNS a function.
// Examples: map, filter, reduce, forEach, setTimeout, addEventListener

const nums = [1, 2, 3, 4, 5];
const doubled  = nums.map(n => n * 2);       // [2,4,6,8,10]
const evens    = nums.filter(n => n % 2 === 0); // [2,4]
const sum      = nums.reduce((acc, n) => acc + n, 0); // 15

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 5 — Pure Functions
// ══════════════════════════════════════════════════════════════════
// Pure = 1) Same input → ALWAYS same output. 2) NO side effects.
// Predictable, testable, cacheable. The gold standard for utility fns.

const add = (a, b) => a + b;          // ✅ pure
const now = () => Date.now();          // ❌ impure (different output every call)

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 6 — First-Class Functions
// ══════════════════════════════════════════════════════════════════
// In JS, functions ARE values. They can be:
//   • Stored in variables / objects / arrays
//   • Passed as arguments
//   • Returned from functions
// This is what makes HOF, closures, and callbacks possible.

const sayHi    = () => "Hi!";          // stored in variable
const actions  = [sayHi, Math.random]; // stored in array
const handler  = { onClick: sayHi };   // stored in object

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 7 — Currying
// ══════════════════════════════════════════════════════════════════
// Transform f(a, b, c) → f(a)(b)(c)
// Each call takes ONE argument, returns a function waiting for the next.
// Enables partial application + reusable specialized functions.

const curriedAdd = a => b => c => a + b + c;
console.log(curriedAdd(1)(2)(3)); // 6

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 8 — Partial Application
// ══════════════════════════════════════════════════════════════════
// Pre-fill SOME arguments of a function, get a new function for the rest.
// Similar to currying but more flexible — pre-fill multiple args at once.

function multiply(a, b, c) { return a * b * c; }

function partial(fn, ...preset) {
  return (...rest) => fn(...preset, ...rest);
}

const double  = partial(multiply, 2);      // pre-fill a=2
const sixX    = partial(multiply, 2, 3);   // pre-fill a=2, b=3
console.log(double(3, 4)); // 24
console.log(sixX(5));      // 30

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 9 — Function Composition
// ══════════════════════════════════════════════════════════════════
// Combine multiple functions where output of one = input of the next.
// compose: right-to-left  |  pipe: left-to-right

const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x);
const pipe    = (...fns) => x => fns.reduce((v, f) => f(v), x);

const trim    = s => s.trim();
const lower   = s => s.toLowerCase();
const exclaim = s => s + "!";

const format  = pipe(trim, lower, exclaim);
console.log(format("  HELLO  ")); // "hello!"

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 10 — Default Parameters
// ══════════════════════════════════════════════════════════════════
// ES6: define fallback values for params if undefined/not passed.
// Evaluated left-to-right. Can reference previous params. NOT for null.

function greet(name = "Guest", msg = `Hello, ${name}`) {
  return msg;
}
console.log(greet());          // "Hello, Guest"
console.log(greet("Alice"));   // "Hello, Alice"
console.log(greet(null));      // "Hello, null"  ← null does NOT trigger default!

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 11 — Rest & Spread Operator
// ══════════════════════════════════════════════════════════════════
// REST   (...args) → collects multiple arguments INTO an array  (in params)
// SPREAD (...arr)  → expands an array/object OUT into individual items

function sumAll(...nums) { return nums.reduce((a, b) => a + b, 0); }
console.log(sumAll(1, 2, 3, 4, 5)); // 15

const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const merged = [...arr1, ...arr2]; // [1,2,3,4,5,6]

// ══════════════════════════════════════════════════════════════════
// 📌 POINT 12 — Arguments Object
// ══════════════════════════════════════════════════════════════════
// `arguments` = array-LIKE object available in regular functions only.
// Contains all passed arguments. NOT available in arrow functions.
// Use ...rest instead in modern code.

function oldStyle() {
  console.log(arguments);        // Arguments [1, 2, 3] — array-like
  console.log(arguments[0]);     // 1
  console.log(arguments.length); // 3
  // arguments.map is undefined — it's NOT a real array
}
oldStyle(1, 2, 3);

// ══════════════════════════════════════════════════════════════════
// ❓ QUICK-FIRE OVERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1.  What is hoisting difference between declaration and expression?
// Q2.  List 5 key differences between arrow and regular functions.
// Q3.  What is an IIFE? When do you use it?
// Q4.  What is a higher-order function? Give 3 examples.
// Q5.  What makes a function "pure"? Why does it matter?
// Q6.  What does "first-class functions" mean in JavaScript?
// Q7.  What is currying? How is it different from partial application?
// Q8.  What is function composition? pipe vs compose?
// Q9.  What is the difference between rest and spread?
// Q10. What is the arguments object? When should you NOT use it?
// Q11. Do default parameters work with null? With undefined?
// Q12. Can you use rest with the arguments object together?
//
// 📚 STUDY ORDER:
//   Day 1 → index.js + 01 + 02
//   Day 2 → 03 + 04 + 05 + 06
//   Day 3 → 07 + 08 + 09
//   Day 4 → 10 + 11 + 12
//   Day 5 → All 12 interview question sets, cold, no hints
