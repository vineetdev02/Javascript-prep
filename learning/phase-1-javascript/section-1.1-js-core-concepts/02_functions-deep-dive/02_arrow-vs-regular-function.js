// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  02_arrow-vs-regular-function.js       ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • ALL 6 differences between arrow and regular functions
//    • `this` binding — the biggest difference (4 scenarios)
//    • Why arrow functions were invented (the real reason)
//    • `arguments` object difference
//    • Constructor / prototype difference
//    • When to use arrow vs regular (pro decision making)
//    • 9 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — THE 6 KEY DIFFERENCES (memorize these)
// ══════════════════════════════════════════════════════════════════
//
//  ┌───────────────────────┬────────────────────┬────────────────────┐
//  │ Feature               │  Regular Function  │   Arrow Function   │
//  ├───────────────────────┼────────────────────┼────────────────────┤
//  │ `this` binding        │ Dynamic (call site) │ Lexical (definition)│
//  │ `arguments` object    │      ✅ Yes         │      ❌ No         │
//  │ Can use `new`         │      ✅ Yes         │      ❌ No         │
//  │ Has `prototype`       │      ✅ Yes         │      ❌ No         │
//  │ `super` binding       │      ✅ Yes         │  Lexical (from parent)│
//  │ Hoisting behavior     │ Decl: full / Expr: TDZ │ Always TDZ    │
//  └───────────────────────┴────────────────────┴────────────────────┘


// ══════════════════════════════════════════════════════════════════
// § 2 — `this` BINDING — THE #1 DIFFERENCE
// ══════════════════════════════════════════════════════════════════
//
// REGULAR FUNCTION: `this` is determined by HOW the function is CALLED
//                   (dynamic binding — changes based on call site)
//
// ARROW FUNCTION:   `this` is inherited from WHERE the function is DEFINED
//                   (lexical binding — fixed at creation, never changes)

// ── Scenario 1: In an object method ──────────────────────────────
const person = {
  name: "Alice",
  greetRegular: function() {
    console.log("Regular:", this.name); // "Alice" ✅ — `this` = person
  },
  greetArrow: () => {
    // Arrow defined in global scope context (object literal doesn't create scope)
    console.log("Arrow:", this?.name);  // undefined ❌ — `this` = global/undefined
  },
};
person.greetRegular(); // "Alice"
person.greetArrow();   // undefined

// ── Scenario 2: The callback problem (WHY arrows were invented) ───
const timer = {
  name: "My Timer",
  start: function() {
    // `this` here = timer object ✅
    console.log("Starting:", this.name); // "My Timer"

    // PROBLEM with regular function callback:
    setTimeout(function() {
      // `this` here = undefined (strict) or window (sloppy) ❌
      console.log("Regular callback this.name:", this?.name); // undefined
    }, 10);

    // SOLUTION with arrow function:
    setTimeout(() => {
      // Arrow inherits `this` from start() — which is timer ✅
      console.log("Arrow callback this.name:", this.name); // "My Timer" ✅
    }, 10);
  },
};
timer.start();

// ── Scenario 3: `this` in a class ────────────────────────────────
class Button {
  constructor(label) {
    this.label = label;
    this.clickCount = 0;
  }

  // Regular method — `this` depends on call site
  handleClickRegular() {
    this.clickCount++;
    console.log(`${this.label} clicked ${this.clickCount} times`);
  }

  // Arrow method — `this` is always this Button instance
  // (Arrow defined in constructor context → always bound to instance)
  handleClickArrow = () => {
    this.clickCount++;
    console.log(`${this.label} clicked ${this.clickCount} times`);
  };

  setupListeners() {
    // Problem: passing regular method as callback loses `this`
    const detached = this.handleClickRegular;
    // detached(); // ❌ this = undefined — lost!

    // Arrow method works fine when detached:
    const detachedArrow = this.handleClickArrow;
    detachedArrow(); // ✅ this still = Button instance
  }
}
const btn = new Button("Submit");
btn.setupListeners();

// ── Scenario 4: Explicit binding (.call, .apply, .bind) ──────────
function regularFn() { return this.value; }
const arrowFn = () => this?.value; // `this` fixed at definition

const context = { value: 42 };

console.log(regularFn.call(context));  // 42 ✅ — regular can be rebound
console.log(arrowFn.call(context));    // undefined ❌ — arrow IGNORES .call/.apply/.bind
// Arrow functions CANNOT be rebound — .bind() returns the arrow unchanged


// ══════════════════════════════════════════════════════════════════
// § 3 — `arguments` OBJECT DIFFERENCE
// ══════════════════════════════════════════════════════════════════

function regularWithArgs() {
  console.log(arguments);        // ✅ Arguments [1, 2, 3] object
  console.log(arguments[0]);     // 1
  console.log(arguments.length); // 3
  return Array.from(arguments).reduce((a, b) => a + b, 0);
}
console.log(regularWithArgs(1, 2, 3)); // 6

const arrowWithArgs = () => {
  // console.log(arguments); // ❌ ReferenceError in strict mode / gets outer scope's arguments
  // Arrow functions do NOT have their own `arguments`
};

// ── Arrow functions inside regular functions ─────────────────────
// Arrow function INHERITS the `arguments` from the nearest regular fn
function outer() {
  const inner = () => {
    console.log(arguments); // ✅ gets outer()'s arguments (NOT inner's)
  };
  inner(10, 20); // inner's own args ignored — gets outer's args
}
outer(1, 2, 3); // logs Arguments [1, 2, 3]

// ── Modern solution: use REST instead of arguments ───────────────
const modernSum = (...nums) => nums.reduce((a, b) => a + b, 0);
console.log(modernSum(1, 2, 3, 4, 5)); // 15 ✅ works in arrow too


// ══════════════════════════════════════════════════════════════════
// § 4 — CONSTRUCTOR DIFFERENCE
// ══════════════════════════════════════════════════════════════════

// ── Regular functions CAN be constructors ────────────────────────
function Animal(name, type) {
  this.name = name;
  this.type = type;
}
Animal.prototype.speak = function() {
  return `${this.name} makes a sound`;
};

const cat = new Animal("Whiskers", "cat");
console.log(cat.name);   // "Whiskers"
console.log(cat.speak()); // "Whiskers makes a sound"

// ── Arrow functions CANNOT be constructors ───────────────────────
const Car = (make, model) => {
  this.make  = make;
  this.model = model;
};

try {
  const myCar = new Car("Toyota", "Camry"); // ❌ TypeError: Car is not a constructor
} catch(e) {
  console.log("Arrow constructor error:", e.message);
}

// WHY? Arrow functions have no `prototype` and no internal [[Construct]] method.
console.log(Animal.prototype); // Animal {} — has prototype
console.log(Car.prototype);    // undefined — no prototype


// ══════════════════════════════════════════════════════════════════
// § 5 — PROTOTYPE DIFFERENCE
// ══════════════════════════════════════════════════════════════════

function RegularFn() {}
const ArrowFn = () => {};

console.log(RegularFn.prototype); // { constructor: RegularFn }
console.log(ArrowFn.prototype);   // undefined

// This is why arrow functions can't be used with `new` —
// there's no prototype to set on the newly created object.


// ══════════════════════════════════════════════════════════════════
// § 6 — ARROW FUNCTION SYNTAX VARIATIONS (all forms)
// ══════════════════════════════════════════════════════════════════

// ── No params ────────────────────────────────────────────────────
const noParams = () => "no params needed";

// ── One param (parens optional) ──────────────────────────────────
const oneParam      = x  => x * 2;   // parens optional
const oneParamSafe  = (x) => x * 2;  // parens preferred for clarity

// ── Multiple params (parens required) ────────────────────────────
const twoParams = (x, y) => x + y;

// ── Implicit return (single expression, no braces) ───────────────
const implicitReturn = (x, y) => x + y;  // parentheses for the expression

// ── Returning an object (MUST wrap in parens!) ───────────────────
const returnObj = (name, age) => ({ name, age });  // ✅
// const broken  = (name, age) => { name, age };   // ❌ treats {} as body, not object

console.log(returnObj("Bob", 25)); // { name: "Bob", age: 25 }

// ── Block body (multi-statement, must use explicit return) ────────
const processData = (data) => {
  const cleaned = data.trim().toLowerCase();
  const words   = cleaned.split(" ");
  return words.map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
};
console.log(processData("  hello world  ")); // "Hello World"


// ══════════════════════════════════════════════════════════════════
// § 7 — WHEN TO USE ARROW vs REGULAR
// ══════════════════════════════════════════════════════════════════

// ── USE ARROW when: ──────────────────────────────────────────────
//   ✅ Callbacks and event handlers inside classes/objects
//   ✅ Functional programming (map, filter, reduce, pipe, compose)
//   ✅ Short utility functions with implicit return
//   ✅ When you need lexical `this` (inside class methods)
//   ✅ Returning objects (with parens)

class ApiService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  getUsers() {
    return fetch(`${this.baseUrl}/users`)
      .then(res => res.json())           // ← arrow: no `this` needed
      .then(data => data.map(user => ({  // ← arrow: concise transform
        id:   user.id,
        name: user.name,
      })))
      .catch(err => console.error(err)); // ← arrow: concise
  }
}

// ── USE REGULAR FUNCTION when: ────────────────────────────────────
//   ✅ Object methods where `this` refers to the object
//   ✅ Constructor functions (before ES6 classes)
//   ✅ Functions that need their own `arguments` object
//   ✅ Generator functions (function*)
//   ✅ Methods that will be called with .call/.apply/.bind
//   ✅ Prototype methods

const counter = {
  value: 0,
  increment() { this.value++; return this; }, // regular — `this` = counter
  decrement() { this.value--; return this; }, // method shorthand (same as regular)
  reset()     { this.value = 0; return this; },
};
counter.increment().increment().increment().decrement();
console.log(counter.value); // 2 — chaining works because `this` = counter


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What are all the differences between arrow and regular functions?
//
// 1. `this`: regular = dynamic (call site). Arrow = lexical (definition site).
// 2. `arguments`: regular has it. Arrow does NOT.
// 3. `new`: regular can be constructor. Arrow cannot.
// 4. `prototype`: regular has it. Arrow does not.
// 5. `.bind/.call/.apply`: can rebind regular. Arrow IGNORES rebinding.
// 6. `super`: arrow uses parent's super lexically.

// ── Q2. Why were arrow functions introduced? ─────────────────────
//
// Primarily to solve the `this` binding problem in callbacks.
// Before ES6, you had to do: `var self = this` or `.bind(this)` to
// preserve `this` inside setTimeout/forEach/etc. Arrow functions
// automatically inherit `this` from the surrounding lexical scope,
// making code cleaner and less error-prone.

// ── Q3. Can you use .bind() to change `this` in an arrow function?
//
// No. Arrow functions lexically bind `this` at creation and it cannot
// be changed. Calling .bind(), .call(), or .apply() on an arrow function
// simply ignores the provided `this` and uses the lexical one.

// ── Q4. What is the output? ──────────────────────────────────────
//
//   const obj = {
//     val: 42,
//     getVal: () => this.val,
//   };
//   console.log(obj.getVal());
//
// Answer: undefined (or error in strict mode).
// Arrow function inherits `this` from where it was DEFINED — the surrounding
// context of the object literal, which is global scope. `this.val` = undefined.

// ── Q5. When should you NOT use arrow functions? ─────────────────
//
// 1. Object methods that need `this` to refer to the object.
// 2. Constructor functions (will throw TypeError with `new`).
// 3. Functions that need `arguments` object.
// 4. Generator functions (function* syntax is required).
// 5. Functions used as prototype methods meant to be rebound.

// ── Q6. Do arrow functions have a `prototype` property? ──────────
//
// No. Arrow functions have no `prototype` property. This is why they
// cannot be used as constructors — there is nothing to set as the
// __proto__ of the newly created object.

// ── Q7. What does arrow function inherit from outer scope? ───────
//
// `this`, `arguments`, `super`, and `new.target` — all four are
// inherited from the closest enclosing non-arrow function.

// ── Q8. Can you use an arrow function as an event handler? ───────
//
// Yes, but with a caveat. In vanilla JS event handlers, regular functions
// receive `this` as the element that triggered the event. Arrow functions
// won't — they'll use the lexical `this`. So if you need `this` to be
// the DOM element: use regular function. If you're inside a class and
// want `this` to be the class instance: use arrow.

// ── Q9. Why do class field arrow functions solve the binding problem?
//
// `handleClick = () => {}` as a class field creates the arrow function
// in the constructor context, where `this` = the instance. This arrow's
// `this` is permanently bound to the instance. Even when detached from
// the object (passed as a callback), `this` remains the instance.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 03_iife-pattern.js
// ══════════════════════════════════════════════════════════════════
