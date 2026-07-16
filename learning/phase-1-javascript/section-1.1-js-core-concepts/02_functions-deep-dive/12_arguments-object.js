// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  12_arguments-object.js                ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: What arguments is, array-like pitfalls, strict mode diff,
//    why rest replaces it, all conversion patterns, 7 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS THE arguments OBJECT?
// ══════════════════════════════════════════════════════════════════
// `arguments` is an automatic local variable available inside ALL
// regular (non-arrow) functions.
// It holds ALL arguments passed to the function — regardless of how
// many parameters the function declares.
//
// Properties:
//   • Array-LIKE (has .length and [index] access)
//   • NOT a real Array (no .map, .filter, .reduce, .forEach)
//   • Only in REGULAR functions — NOT in arrow functions
//   • Has a `callee` property (deprecated in strict mode)

function showArguments() {
  console.log(arguments);         // Arguments object
  console.log(arguments.length);  // how many were passed
  console.log(arguments[0]);      // first argument
  console.log(arguments[1]);      // second argument
}
showArguments(10, "hello", true, { id: 1 });
// Arguments [10, "hello", true, { id: 1 }]
// length: 4,  [0]: 10,  [1]: "hello"

// ── arguments captures ALL args even undeclared ───────────────────
function declared(a, b) {
  console.log(arguments.length); // 5 — even though only 2 params declared
  console.log(arguments[4]);     // 50
}
declared(1, 2, 3, 4, 50);

// ══════════════════════════════════════════════════════════════════
// § 2 — ARRAY-LIKE vs REAL ARRAY
// ══════════════════════════════════════════════════════════════════

function demoArrayLike() {
  console.log(Array.isArray(arguments)); // false — NOT a real array!

  // ❌ These don't work:
  // arguments.map(n => n * 2);    // TypeError: not a function
  // arguments.filter(n => n > 0); // TypeError
  // arguments.forEach(n => {});   // TypeError

  // ✅ These work (array-like features):
  console.log(arguments[0]);     // index access ✅
  console.log(arguments.length); // length ✅
  for (let i = 0; i < arguments.length; i++) {
    console.log(arguments[i]);   // iteration via for loop ✅
  }
  for (const arg of arguments) { // for...of works (it's iterable) ✅
    console.log(arg);
  }
}
demoArrayLike(1, 2, 3);


// ══════════════════════════════════════════════════════════════════
// § 3 — CONVERTING arguments TO A REAL ARRAY
// ══════════════════════════════════════════════════════════════════

function convertDemo() {
  // Method 1: Array.from (preferred, readable)
  const arr1 = Array.from(arguments);

  // Method 2: spread operator
  const arr2 = [...arguments];

  // Method 3: Array.prototype.slice.call (old ES5 way)
  const arr3 = Array.prototype.slice.call(arguments);

  // Now all array methods work:
  console.log(arr1.map(n => n * 2));
  console.log(arr2.filter(n => n > 2));
  console.log(arr3.reduce((a, b) => a + b, 0));
}
convertDemo(1, 2, 3, 4, 5);


// ══════════════════════════════════════════════════════════════════
// § 4 — arguments vs NAMED PARAMS (sync behavior in sloppy mode!)
// ══════════════════════════════════════════════════════════════════

// In SLOPPY mode: arguments and named params are LINKED!
function sloppyMode(a, b) {
  console.log(a, arguments[0]); // 1, 1
  a = 99;
  console.log(a, arguments[0]); // 99, 99 ← arguments[0] changed too!
}
sloppyMode(1, 2);

// In STRICT mode: arguments and named params are NOT linked
function strictMode(a, b) {
  "use strict";
  console.log(a, arguments[0]); // 1, 1
  a = 99;
  console.log(a, arguments[0]); // 99, 1 ← arguments[0] unchanged ✅
}
strictMode(1, 2);


// ══════════════════════════════════════════════════════════════════
// § 5 — arguments IN ARROW FUNCTIONS
// ══════════════════════════════════════════════════════════════════

// Arrow functions do NOT have their own `arguments`.
// They inherit `arguments` from the closest enclosing REGULAR function.

function outer() {
  const inner = () => {
    // `arguments` here = outer's arguments, NOT inner's!
    console.log("inner arrow arguments:", arguments); // [1, 2, 3]
  };
  inner(10, 20); // these args are IGNORED for arguments — gets outer's
}
outer(1, 2, 3);

// If there's no enclosing regular function:
const arrowFn = () => {
  // console.log(arguments); // ❌ ReferenceError in strict / global arguments in sloppy
};

// ── Solution: use rest params in arrows ──────────────────────────
const arrowWithRest = (...args) => {
  console.log(args);            // real array ✅
  console.log(args.map(n => n * 2)); // works! ✅
};
arrowWithRest(1, 2, 3); // [2, 4, 6]


// ══════════════════════════════════════════════════════════════════
// § 6 — arguments.callee (deprecated, know it exists)
// ══════════════════════════════════════════════════════════════════
// arguments.callee = reference to the function being executed.
// Used for anonymous recursive functions before named expressions existed.
// DEPRECATED in strict mode (throws TypeError).

// OLD way (avoid):
// const factorial = function(n) {
//   if (n <= 1) return 1;
//   return n * arguments.callee(n - 1); // ← deprecated!
// };

// MODERN way (use named expression instead):
const factorial = function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1); // named reference — safe, not deprecated
};
console.log(factorial(5)); // 120


// ══════════════════════════════════════════════════════════════════
// § 7 — WHEN TO STILL USE arguments (legacy scenarios)
// ══════════════════════════════════════════════════════════════════
// Almost never in modern code. Prefer rest params (...args).
// You still encounter `arguments` when:
//   • Reading/maintaining legacy ES5 code
//   • Polyfills and library code that targets very old environments
//   • Some frameworks that inspect argument count for overloading

// Legacy overloading pattern (still seen in old codebases):
function legacyOverload() {
  if (arguments.length === 0) return "no args";
  if (arguments.length === 1) return `one: ${arguments[0]}`;
  return `multiple: ${Array.from(arguments).join(", ")}`;
}
console.log(legacyOverload());           // "no args"
console.log(legacyOverload("hello"));    // "one: hello"
console.log(legacyOverload(1, 2, 3));    // "multiple: 1, 2, 3"

// Modern equivalent (clean, arrow-compatible):
const modernOverload = (...args) => {
  if (args.length === 0) return "no args";
  if (args.length === 1) return `one: ${args[0]}`;
  return `multiple: ${args.join(", ")}`;
};


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// Q1. What is the arguments object?
// An automatic array-like object in regular functions containing all passed args.
// Has .length and index access but lacks array methods (map, filter, etc.).
// Only available in regular (non-arrow) functions.

// Q2. What is the difference between arguments and rest parameters?
// arguments: array-like, no array methods, includes ALL args, not in arrows, legacy.
// rest (...args): real Array, has all array methods, only captures "rest" after
// named params, works in arrows, modern and preferred.

// Q3. How do you convert arguments to a real array?
// Array.from(arguments), [...arguments], or Array.prototype.slice.call(arguments).
// Modern code: just use rest params instead.

// Q4. Are arguments available in arrow functions?
// No. Arrow functions don't have their own arguments. They inherit it from the
// nearest enclosing regular function — which might cause unexpected behavior.
// Use rest params (...args) in arrow functions instead.

// Q5. What is the arguments/param link in sloppy mode?
// In non-strict mode, arguments[n] and the nth named parameter are LINKED —
// changing one changes the other. In strict mode, they are independent.
// This is another reason to always use strict mode.

// Q6. What is arguments.callee? Should you use it?
// A reference to the currently executing function. Used for anonymous recursion.
// DEPRECATED — throws TypeError in strict mode. Use named function expressions instead.

// Q7. When would you still encounter arguments today?
// Reading legacy ES5 code, old polyfills, or some older frameworks.
// In new code, always prefer rest params.

// ══════════════════════════════════════════════════════════════════
// 🏁 FUNCTIONS DEEP DIVE — COMPLETE!
//
// ✅ Review checklist:
//    □ Declaration vs expression (hoisting, named expr, recursion)
//    □ Arrow vs regular (6 differences, `this`, callback fix)
//    □ IIFE (scope, module pattern, async, return values)
//    □ Higher-order functions (map/filter/reduce from scratch)
//    □ Pure functions (side effects, mutation, Redux reducers)
//    □ First-class functions (5 behaviors, callbacks, strategy)
//    □ Currying (manual + generic curry(), real use cases)
//    □ Partial application (partial() + .bind() pattern)
//    □ Function composition (pipe + compose, async pipe)
//    □ Default parameters (undefined vs null, expressions, TDZ)
//    □ Rest & Spread (same syntax, opposite direction, immutable patterns)
//    □ arguments object (array-like, strict mode link, vs rest)
//
// 📚 NEXT TOPIC → this Keyword — Most Asked
// ══════════════════════════════════════════════════════════════════
