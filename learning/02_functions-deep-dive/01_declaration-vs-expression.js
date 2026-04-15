// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  01_declaration-vs-expression.js       ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • 3 ways to define a function (declaration, expression, arrow)
//    • Hoisting difference — the #1 behavioral gap
//    • Named vs anonymous function expressions
//    • When to use which (professional decision making)
//    • Recursion with named expressions
//    • Real bugs caused by wrong choice
//    • 8 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — THREE WAYS TO DEFINE A FUNCTION
// ══════════════════════════════════════════════════════════════════

// ── Type 1: Function DECLARATION ─────────────────────────────────
// Syntax: function name() {}
// • Starts with the `function` keyword as the FIRST thing on the line
// • FULLY HOISTED — name + body both available before the line
// • Always has a name (anonymous declarations don't exist)

function add(a, b) {
  return a + b;
}

// ── Type 2: Function EXPRESSION ──────────────────────────────────
// Syntax: const name = function() {}
// • The function is ASSIGNED to a variable
// • NOT fully hoisted — variable is TDZ (let/const) or undefined (var)
// • Can be anonymous OR named

const multiply = function(a, b) {   // anonymous expression
  return a * b;
};

const subtract = function subtractFn(a, b) { // named expression
  return a - b;
};

// ── Type 3: Arrow Function EXPRESSION ────────────────────────────
// Syntax: const name = () => {}
// • Shorter syntax, ALWAYS an expression
// • No own `this`, `arguments`, `super`, `new.target`
// • Cannot be used as constructor (no `new`)

const divide = (a, b) => a / b; // implicit return for single expressions

const square = (n) => {
  const result = n * n; // block body — must use explicit return
  return result;
};


// ══════════════════════════════════════════════════════════════════
// § 2 — THE HOISTING DIFFERENCE  ← Most interviewed part
// ══════════════════════════════════════════════════════════════════

// ── Function DECLARATION: fully hoisted ──────────────────────────
console.log(hoistedDeclaration(3, 4)); // ✅ 7 — works before definition!

function hoistedDeclaration(a, b) {
  return a + b;
}

// ── Function EXPRESSION with var: undefined before assignment ─────
// varExpression(2, 3); // ❌ TypeError: varExpression is not a function
//                      // var is hoisted as undefined — calling undefined() = TypeError

var varExpression = function(a, b) { return a + b; };
console.log(varExpression(2, 3)); // ✅ 5 — works after assignment

// ── Function EXPRESSION with const/let: TDZ before assignment ────
// constExpression(2, 3); // ❌ ReferenceError: Cannot access before initialization

const constExpression = function(a, b) { return a + b; };
console.log(constExpression(2, 3)); // ✅ 5

// ── Arrow with const: same as const expression (TDZ) ────────────
// arrowFn(5); // ❌ ReferenceError

const arrowFn = (n) => n * 2;
console.log(arrowFn(5)); // ✅ 10

// ── SUMMARY TABLE ────────────────────────────────────────────────
//
//  ┌──────────────────────────────┬─────────────┬─────────────────┐
//  │ Declaration Type             │ Hoisted?    │ Usable before?  │
//  ├──────────────────────────────┼─────────────┼─────────────────┤
//  │ function foo() {}            │ ✅ Fully    │ ✅ Yes          │
//  │ var foo = function() {}      │ ✅ Partial  │ ❌ TypeError    │
//  │ const foo = function() {}    │ ✅ TDZ      │ ❌ RefError     │
//  │ const foo = () => {}         │ ✅ TDZ      │ ❌ RefError     │
//  └──────────────────────────────┴─────────────┴─────────────────┘


// ══════════════════════════════════════════════════════════════════
// § 3 — NAMED vs ANONYMOUS EXPRESSIONS
// ══════════════════════════════════════════════════════════════════

// ── Anonymous expression ─────────────────────────────────────────
const anon = function(x) { return x * 2; };
// anon.name === "anon"  (JS infers the name from the variable name — since ES6)

// ── Named expression ─────────────────────────────────────────────
const namedExp = function myInternalName(x) {
  // `myInternalName` is accessible INSIDE the function body only
  // Very useful for recursion in expressions!
  if (x <= 0) return 0;
  return x + myInternalName(x - 1); // ✅ self-reference works!
};
console.log(namedExp(5)); // 15 (5+4+3+2+1+0)
// console.log(myInternalName); // ❌ ReferenceError — not visible outside

// WHY use a named expression?
//   1. Self-reference / recursion inside the function
//   2. Better stack traces — shows the internal name in errors
//   3. Named functions are easier to debug (DevTools shows the name)

// ── Recursion comparison ──────────────────────────────────────────
// BAD — anonymous, breaks if variable is reassigned:
const factorial = function(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1); // relies on the OUTER variable name `factorial`
};
// If someone does: const backup = factorial; factorial = null;
// Then: backup(5) → TypeError inside, because it calls factorial which is null

// GOOD — named expression, self-contained:
const factorialSafe = function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1); // calls `fact` — the internal name, always stable
};
console.log(factorialSafe(5)); // 120 ✅


// ══════════════════════════════════════════════════════════════════
// § 4 — SCOPE DIFFERENCES
// ══════════════════════════════════════════════════════════════════

// ── Declaration: accessible in the WHOLE scope it's declared in ──
function outerScope() {
  // Both of these are accessible anywhere in outerScope() due to hoisting:
  console.log(inner()); // ✅ "inner ran"
  function inner() { return "inner ran"; }
}
outerScope();

// ── Expression: only accessible AFTER its line ──────────────────
function outerScope2() {
  // console.log(inner2()); // ❌ ReferenceError (TDZ for const)
  const inner2 = () => "inner2 ran";
  console.log(inner2()); // ✅ "inner2 ran"
}
outerScope2();


// ══════════════════════════════════════════════════════════════════
// § 5 — WHEN TO USE WHICH
// ══════════════════════════════════════════════════════════════════

// ── Use DECLARATION for: ─────────────────────────────────────────
//   • Main utility/helper functions that should be hoisted
//   • Functions you want to call from anywhere in the file
//   • Exported module functions (readability)
//   • Recursive functions (they can reference themselves by name)

function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

// ── Use EXPRESSION (const arrow) for: ───────────────────────────
//   • Callbacks inline
//   • Methods where `this` should be lexical (event handlers in classes)
//   • When you want to PREVENT the function from being called before declaration
//   • Functional programming patterns (HOF, currying, composition)
//   • Storing functions in objects/arrays

const processUser = (user) => ({
  ...user,
  fullName: `${user.firstName} ${user.lastName}`,
  createdAt: new Date().toISOString(),
});

// ── Use NAMED EXPRESSION for: ────────────────────────────────────
//   • Recursive expressions
//   • Better debugging (shows name in stack trace)

const fibonacci = function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};
console.log(fibonacci(8)); // 21


// ══════════════════════════════════════════════════════════════════
// § 6 — REAL BUGS FROM WRONG CHOICE
// ══════════════════════════════════════════════════════════════════

// ── Bug 1: Using var expression, relying on hoisting ────────────
function riskyCode() {
  calculate(5); // ❌ TypeError — var calculate is hoisted as undefined

  var calculate = function(x) { return x * 2; };
}
// Fix: use function declaration if you need hoisting, or declare first.

// ── Bug 2: Overwriting a function declaration ────────────────────
function setup() {
  // Someone defines the same name twice (declaration overwritten by var):
  function init() { return "original"; }
  var init = "now I'm a string!"; // var declaration hoisted, overwrites fn
  // console.log(init()); // TypeError: init is not a function
  console.log(init);      // "now I'm a string!"
}
setup();

// Fix: use const for assignments, never mix var declarations with fn names.

// ── Bug 3: Forgetting arrow functions can't be constructors ──────
const PersonArrow = (name) => { this.name = name; };
try {
  // const p = new PersonArrow("Alice"); // ❌ TypeError: PersonArrow is not a constructor
} catch(e) {
  console.log("Arrow cannot be constructor:", e.message);
}

// Fix: use function declaration or expression for constructors:
function PersonDecl(name) { this.name = name; }
const p = new PersonDecl("Alice"); // ✅
console.log(p.name); // "Alice"


// ══════════════════════════════════════════════════════════════════
// § 7 — FUNCTION.NAME PROPERTY (bonus — senior level)
// ══════════════════════════════════════════════════════════════════

function declared() {}
const expressed    = function() {};
const namedExpr    = function myName() {};
const arrowExpress = () => {};

console.log(declared.name);    // "declared"
console.log(expressed.name);   // "expressed"   ← inferred from variable name (ES6)
console.log(namedExpr.name);   // "myName"       ← uses internal name
console.log(arrowExpress.name);// "arrowExpress" ← inferred

// Anonymous function passed directly — no name inferred:
const obj2 = {
  method: function() {},
  arrow:  () => {},
};
console.log(obj2.method.name); // "method" ← inferred from key name


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is the difference between function declaration and expression?
//
// Declaration: starts with `function` keyword, fully hoisted (callable before definition),
// always has a name. Expression: assigned to a variable, not fully hoisted (TDZ for
// let/const, undefined for var), can be anonymous or named.

// ── Q2. Can you call a function before it's defined? ─────────────
//
// Only if it's a function DECLARATION — they are fully hoisted.
// Function expressions (var/let/const = function) cannot be called before
// their line: var gives TypeError, let/const give ReferenceError.

// ── Q3. What is a named function expression? When do you use it? ─
//
// A function expression with an internal name: `const fn = function myName() {}`.
// The name is only accessible INSIDE the function body. Use for:
// 1. Recursion — self-reference via the internal name.
// 2. Better debugging — the name shows in stack traces.

// ── Q4. What happens if you call a var function expression before assignment?
//
// TypeError: the variable is not a function.
// var is hoisted as undefined. Calling undefined() throws TypeError (not ReferenceError).
// This is different from let/const which throw ReferenceError (TDZ).

// ── Q5. Is an arrow function a declaration or expression? ────────
//
// Always an expression — it must be assigned to something.
// It cannot start a statement the way function declarations can.
// Arrow functions are also unique in having no `this`, `arguments`,
// `new.target`, `super`, and cannot be used as constructors.

// ── Q6. When would you choose declaration over expression? ───────
//
// When you want the function to be callable anywhere in the file/scope
// (e.g., utility helpers at the bottom, main logic at the top).
// When writing recursive named functions.
// When readability matters more than preventing hoisting.

// ── Q7. What is function.name? How does it differ? ───────────────
//
// Every function has a `.name` property. For declarations: the function name.
// For expressions: inferred from the variable name (since ES6). For named
// expressions: the internal name. This is used in stack traces for debugging.

// ── Q8. Can a function declaration be inside an if block? ────────
//
// Technically yes, but the behavior is inconsistent across environments.
// In strict mode, block-scoped function declarations behave like let.
// In sloppy mode, results vary per browser. Best practice: NEVER use
// function declarations inside if/for/while blocks. Use expressions instead:
//   if (condition) { const fn = () => {}; }

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 02_arrow-vs-regular-function.js
// ══════════════════════════════════════════════════════════════════
