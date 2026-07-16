// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  06_first-class-functions.js           ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: What first-class means, all 5 behaviors, why it enables
//    HOF/closures/callbacks/functional patterns, 6 interview Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT DOES "FIRST-CLASS" MEAN?
// ══════════════════════════════════════════════════════════════════
// "First-class" means functions are treated as VALUES — just like
// numbers, strings, objects, or arrays.
//
// A value in JS can be:
//   1. Stored in a variable
//   2. Stored in an object property or array
//   3. Passed as an argument to a function
//   4. Returned from a function
//   5. Created dynamically at runtime
//
// ALL of these apply to functions in JavaScript.
// This is what makes HOFs, closures, callbacks, and functional
// programming POSSIBLE in JS.

// ══════════════════════════════════════════════════════════════════
// § 2 — THE 5 BEHAVIORS WITH PROOF
// ══════════════════════════════════════════════════════════════════

// ── 1. Stored in a variable ───────────────────────────────────────
const greet = function(name) { return `Hello, ${name}!`; };
const greet2 = (name) => `Hi, ${name}!`;
console.log(greet("Alice"));  // "Hello, Alice!"
console.log(greet2("Bob"));   // "Hi, Bob!"

// ── 2. Stored in object properties ───────────────────────────────
const mathUtils = {
  add:      (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide:   (a, b) => a / b,
};
console.log(mathUtils.add(5, 3));      // 8
console.log(mathUtils["multiply"](4, 5)); // 20

// ── Stored in arrays ──────────────────────────────────────────────
const validators = [
  (v) => v !== null && v !== undefined,  // notEmpty
  (v) => typeof v === "string",           // isString
  (v) => v.length >= 3,                  // minLength
];
function validate(value) {
  return validators.every(fn => fn(value));
}
console.log(validate("Alice")); // true ✅
console.log(validate("Al"));    // false ❌ (too short)
console.log(validate(42));      // false ❌ (not string)

// ── 3. Passed as an argument ──────────────────────────────────────
function applyOperation(a, b, operation) {
  return operation(a, b);
}
console.log(applyOperation(10, 3, (a,b) => a + b)); // 13
console.log(applyOperation(10, 3, (a,b) => a * b)); // 30
console.log(applyOperation(10, 3, Math.max));        // 10

// ── 4. Returned from a function ───────────────────────────────────
function createValidator(type) {
  const validators = {
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    phone: (v) => /^\+?[\d\s-]{10,}$/.test(v),
    zip:   (v) => /^\d{5}(-\d{4})?$/.test(v),
  };
  return validators[type] || (() => false);
}
const isEmail = createValidator("email");
const isPhone = createValidator("phone");
console.log(isEmail("alice@example.com")); // true
console.log(isPhone("+91-9999999999"));    // true

// ── 5. Created dynamically ────────────────────────────────────────
const operations = ["add", "subtract", "multiply"];
const fns = operations.reduce((acc, op) => {
  acc[op] = (a, b) => {
    if (op === "add")      return a + b;
    if (op === "subtract") return a - b;
    if (op === "multiply") return a * b;
  };
  return acc;
}, {});
console.log(fns.add(3, 4));      // 7
console.log(fns.multiply(3, 4)); // 12


// ══════════════════════════════════════════════════════════════════
// § 3 — FIRST-CLASS FUNCTIONS ENABLE: callbacks
// ══════════════════════════════════════════════════════════════════
// A callback is just a function passed as an argument.
// Only possible because functions are first-class values.

// Sync callback:
[1,2,3].forEach(n => console.log(n)); // forEach receives a function

// Async callback:
setTimeout(() => console.log("async callback!"), 100);

// Event callback (browser):
// document.addEventListener("click", (e) => console.log(e.target));

// Node.js callback style:
// fs.readFile("file.txt", "utf8", (err, data) => {
//   if (err) throw err;
//   console.log(data);
// });

// Promise callback:
Promise.resolve(42)
  .then(v => v * 2)        // .then takes a function
  .then(v => console.log(v)); // 84


// ══════════════════════════════════════════════════════════════════
// § 4 — FUNCTION AS DATA: strategy pattern
// ══════════════════════════════════════════════════════════════════
// Because functions are data, you can select behavior at runtime.

const sortStrategies = {
  byName:  (a, b) => a.name.localeCompare(b.name),
  byAge:   (a, b) => a.age - b.age,
  byScore: (a, b) => b.score - a.score, // descending
};

function sortUsers(users, strategy = "byName") {
  return [...users].sort(sortStrategies[strategy]);
}

const users = [
  { name: "Carol", age: 30, score: 90 },
  { name: "Alice", age: 25, score: 70 },
  { name: "Bob",   age: 28, score: 85 },
];

console.log(sortUsers(users, "byAge").map(u => u.name));   // Alice, Bob, Carol
console.log(sortUsers(users, "byScore").map(u => u.name)); // Carol, Bob, Alice
console.log(sortUsers(users).map(u => u.name));            // Alice, Bob, Carol


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// Q1. What does "first-class functions" mean in JavaScript?
// Functions are treated as values — they can be stored in variables,
// passed as arguments, returned from functions, stored in objects/arrays,
// and created at runtime. This is what makes HOFs, closures, and callbacks possible.

// Q2. What is the difference between first-class and higher-order functions?
// "First-class" is a language property — functions are values.
// "Higher-order" is a function property — it takes or returns functions.
// First-class is WHY higher-order functions are possible.

// Q3. What is a callback function?
// A function passed as an argument to another function, to be called
// at a specific time. Possible only because functions are first-class.
// Examples: setTimeout, addEventListener, Array.map, Promise.then.

// Q4. Give an example of storing functions in an object.
// The strategy pattern — store different sorting/validation/formatting
// functions as values in an object keyed by name. Select at runtime.

// Q5. Can you store functions in an array?
// Yes. This is common for middleware chains, validation pipelines, or
// observer lists. Loop through the array and call each function.

// Q6. Why do languages without first-class functions struggle with async?
// Without first-class functions, you can't pass callbacks, which are
// the foundation of async patterns. No callbacks → no event-driven I/O →
// everything must be synchronous/blocking.

// 📚 NEXT → 07_currying.js
