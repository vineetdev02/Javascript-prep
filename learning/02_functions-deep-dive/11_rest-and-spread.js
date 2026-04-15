// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  11_rest-and-spread.js                 ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: rest vs spread (same syntax, opposite direction),
//    all usage patterns, immutable patterns, 8 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — THE CORE MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
// SAME syntax (...) — completely OPPOSITE behavior:
//
//  REST   (...args)  → COLLECTS multiple values INTO one array  (in params)
//  SPREAD (...arr)   → EXPANDS one iterable INTO multiple values (in calls/literals)
//
// Memory trick:
//   REST  = "rest of them" → gathers remainders into an array
//   SPREAD = "spread out"  → fans out array into individual values

// ══════════════════════════════════════════════════════════════════
// § 2 — REST PARAMETER
// ══════════════════════════════════════════════════════════════════

// ── Basic rest ────────────────────────────────────────────────────
function sumAll(...nums) {              // nums = real Array
  return nums.reduce((a, b) => a + b, 0);
}
console.log(sumAll(1, 2, 3));          // 6
console.log(sumAll(1, 2, 3, 4, 5));   // 15
console.log(sumAll());                 // 0 (empty array)

// ── Rest with required params first ───────────────────────────────
function logWithLevel(level, ...messages) {
  messages.forEach(msg => console.log(`[${level}] ${msg}`));
}
logWithLevel("INFO", "Server started", "Listening on port 3000");
// [INFO] Server started
// [INFO] Listening on port 3000

// ── Rest must be LAST parameter ──────────────────────────────────
// function bad(...a, b) {} // ❌ SyntaxError: Rest must be last param
function good(a, b, ...rest) {
  console.log(a, b, rest); // rest = array of remaining args
}
good(1, 2, 3, 4, 5); // a=1, b=2, rest=[3,4,5]

// ── Rest gives a REAL Array (unlike arguments) ────────────────────
function withRest(...args) {
  console.log(Array.isArray(args)); // true ✅
  args.forEach(v => console.log(v)); // ✅ array methods work
  return args.map(n => n * 2);
}
console.log(withRest(1, 2, 3)); // [2, 4, 6]

// ── Rest in destructuring ─────────────────────────────────────────
const [first, second, ...remaining] = [10, 20, 30, 40, 50];
console.log(first);     // 10
console.log(second);    // 20
console.log(remaining); // [30, 40, 50]

const { name, ...otherProps } = { name: "Alice", age: 25, role: "admin" };
console.log(name);       // "Alice"
console.log(otherProps); // { age: 25, role: "admin" }


// ══════════════════════════════════════════════════════════════════
// § 3 — SPREAD OPERATOR
// ══════════════════════════════════════════════════════════════════

// ── Spread in function CALLS ──────────────────────────────────────
const nums = [3, 1, 4, 1, 5, 9, 2, 6];

// OLD way (still works):
console.log(Math.max.apply(null, nums)); // 9

// MODERN way with spread:
console.log(Math.max(...nums)); // 9  ← spreads array into individual args
console.log(Math.min(...nums)); // 1

// Combining with other args:
function createUser(id, name, role) {
  return { id, name, role };
}
const args = ["Alice", "admin"];
console.log(createUser(1, ...args)); // { id: 1, name: "Alice", role: "admin" }

// ── Spread in ARRAY literals ──────────────────────────────────────
const a = [1, 2, 3];
const b = [4, 5, 6];

const merged   = [...a, ...b];           // [1,2,3,4,5,6]
const prepend  = [0, ...a];              // [0,1,2,3]
const append   = [...a, 4];             // [1,2,3,4]
const copy     = [...a];                 // shallow copy — new array!
const insert   = [...a.slice(0,1), 99, ...a.slice(1)]; // [1,99,2,3]

console.log(merged);  // [1,2,3,4,5,6]
console.log(copy === a); // false ← new array, not same reference

// ── Spread in OBJECT literals ─────────────────────────────────────
const defaults = { theme: "light", lang: "en", debug: false };
const userPrefs = { theme: "dark", fontSize: 16 };

// Merge objects (right side overrides left):
const finalConfig = { ...defaults, ...userPrefs };
console.log(finalConfig);
// { theme: "dark", lang: "en", debug: false, fontSize: 16 }
// ← userPrefs.theme overrides defaults.theme ✅

// Immutable update pattern (used in React/Redux):
const state = { count: 0, user: "Alice", active: true };
const newState = { ...state, count: state.count + 1 }; // only change count
console.log(newState);   // { count: 1, user: "Alice", active: true }
console.log(state.count); // 0 ← original unchanged ✅

// ── Spread converts iterables to arrays ───────────────────────────
const str    = "hello";
const chars  = [...str];         // ["h","e","l","l","o"]
const setArr = [...new Set([1,2,2,3,3,3])]; // [1,2,3] — dedup!
const mapArr = [...new Map([["a",1],["b",2]])]; // [["a",1],["b",2]]

console.log(chars);  // ["h","e","l","l","o"]
console.log(setArr); // [1,2,3]


// ══════════════════════════════════════════════════════════════════
// § 4 — IMMUTABLE PATTERNS WITH SPREAD (React/Redux must-know)
// ══════════════════════════════════════════════════════════════════

// ── Add item to array (immutable) ────────────────────────────────
const addItem = (arr, item) => [...arr, item];
const removeItem = (arr, index) => [
  ...arr.slice(0, index),
  ...arr.slice(index + 1),
];
const updateItem = (arr, index, newItem) => [
  ...arr.slice(0, index),
  newItem,
  ...arr.slice(index + 1),
];

const fruits = ["apple", "banana", "cherry"];
console.log(addItem(fruits, "date"));         // ["apple","banana","cherry","date"]
console.log(removeItem(fruits, 1));           // ["apple","cherry"]
console.log(updateItem(fruits, 1, "blueberry")); // ["apple","blueberry","cherry"]
console.log(fruits); // ["apple","banana","cherry"] ← original untouched ✅

// ── Update nested object (immutable) ─────────────────────────────
const user = {
  name: "Alice",
  address: { city: "Mumbai", zip: "400001" },
  preferences: { theme: "dark" }
};

// Update nested city:
const updatedUser = {
  ...user,
  address: { ...user.address, city: "Delhi" },
};
console.log(updatedUser.address.city); // "Delhi"
console.log(user.address.city);        // "Mumbai" ← original unchanged ✅


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════

// Q1. What is the difference between rest and spread?
// Same ... syntax, opposite direction. Rest collects multiple values INTO an array
// (in function params/destructuring). Spread expands an array/object OUT
// (in function calls/array literals/object literals).

// Q2. Where must the rest parameter be placed?
// Last parameter only. `function f(a, ...rest)` ✅. `function f(...rest, a)` ❌.

// Q3. How is rest different from the arguments object?
// rest is a real Array — has .map, .filter, .reduce.
// arguments is array-like — lacks array methods. Must convert: Array.from(arguments).
// rest excludes named parameters before it. arguments includes ALL args.
// rest works in arrow functions. arguments doesn't.

// Q4. How do you use spread to clone an array without mutation?
// const copy = [...original] — creates a shallow copy. Changes to copy don't affect original.

// Q5. What is a shallow copy? Can spread do deep copy?
// Shallow: top-level properties are copied, but nested objects still share reference.
// Spread is SHALLOW. To deep clone: JSON.parse(JSON.stringify(obj)) or structuredClone().

// Q6. How would you merge two objects where right side wins?
// const merged = { ...leftObj, ...rightObj } — rightObj's keys override leftObj's.

// Q7. Can spread work on any iterable?
// Yes — arrays, strings, Sets, Maps, NodeLists, generators, any iterable.
// But object spread {...obj} only works on objects (not generic iterables).

// Q8. How does spread help with immutable state updates in React?
// const newState = { ...prevState, updatedField: newValue }
// Returns a new object, original untouched. React detects reference change → re-renders.

// 📚 NEXT → 12_arguments-object.js
