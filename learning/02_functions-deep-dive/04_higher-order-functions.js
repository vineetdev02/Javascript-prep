// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  04_higher-order-functions.js          ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: HOF definition, map/filter/reduce from scratch,
//    custom HOFs, real patterns, 8 interview Q&As
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS A HIGHER-ORDER FUNCTION?
// ══════════════════════════════════════════════════════════════════
// A function is Higher-Order if it does ONE or BOTH of:
//   1. TAKES a function as an argument
//   2. RETURNS a function
//
// Possible because JS has first-class functions (functions are values).
// HOFs are the backbone of functional programming in JS.

// Takes a function:
function runTwice(fn) {
  fn();
  fn();
}
runTwice(() => console.log("ran!")); // "ran!" "ran!"

// Returns a function:
function makeGreeter(greeting) {
  return (name) => `${greeting}, ${name}!`;
}
const hello = makeGreeter("Hello");
const hola  = makeGreeter("Hola");
console.log(hello("Alice")); // "Hello, Alice!"
console.log(hola("Bob"));    // "Hola, Bob!"


// ══════════════════════════════════════════════════════════════════
// § 2 — BUILT-IN HOFs: map, filter, reduce (implement from scratch)
// ══════════════════════════════════════════════════════════════════

// ── map — transform every element ───────────────────────────────
const nums = [1, 2, 3, 4, 5];
const doubled = nums.map(n => n * 2);  // [2,4,6,8,10]

// Implementing map from scratch:
Array.prototype.myMap = function(callback) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    result.push(callback(this[i], i, this)); // value, index, array
  }
  return result;
};
console.log([1,2,3].myMap(n => n ** 2)); // [1,4,9]

// ── filter — keep elements that pass a test ───────────────────────
const evens = nums.filter(n => n % 2 === 0); // [2,4]

Array.prototype.myFilter = function(callback) {
  const result = [];
  for (let i = 0; i < this.length; i++) {
    if (callback(this[i], i, this)) result.push(this[i]);
  }
  return result;
};
console.log([1,2,3,4,5].myFilter(n => n > 3)); // [4,5]

// ── reduce — accumulate into a single value ───────────────────────
const sum  = nums.reduce((acc, n) => acc + n, 0);       // 15
const prod = nums.reduce((acc, n) => acc * n, 1);       // 120
const max  = nums.reduce((m, n) => n > m ? n : m);      // 5

Array.prototype.myReduce = function(callback, initialValue) {
  let acc = initialValue !== undefined ? initialValue : this[0];
  let start = initialValue !== undefined ? 0 : 1;
  for (let i = start; i < this.length; i++) {
    acc = callback(acc, this[i], i, this);
  }
  return acc;
};
console.log([1,2,3,4].myReduce((acc, n) => acc + n, 0)); // 10

// ── forEach — side effect per element (returns undefined) ─────────
nums.forEach((n, i) => console.log(`nums[${i}] = ${n}`));

// ── find / findIndex ─────────────────────────────────────────────
const users = [
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob",   role: "user" },
  { id: 3, name: "Carol", role: "admin" },
];
const admin     = users.find(u => u.role === "admin");        // first match
const adminIdx  = users.findIndex(u => u.role === "admin");   // 0
const allAdmins = users.filter(u => u.role === "admin");      // all matches

// ── some / every ─────────────────────────────────────────────────
const hasAdmin   = users.some(u => u.role === "admin");   // true — any
const allAdmins2 = users.every(u => u.role === "admin");  // false — all


// ══════════════════════════════════════════════════════════════════
// § 3 — CHAINING HOFs (pipeline pattern)
// ══════════════════════════════════════════════════════════════════

const orders = [
  { id: 1, product: "Laptop", price: 1200, qty: 1, paid: true  },
  { id: 2, product: "Phone",  price: 800,  qty: 2, paid: false },
  { id: 3, product: "Tablet", price: 400,  qty: 3, paid: true  },
  { id: 4, product: "Watch",  price: 200,  qty: 1, paid: true  },
];

// Get total revenue from paid orders above $300:
const revenue = orders
  .filter(order => order.paid)              // keep paid
  .filter(order => order.price > 300)       // keep expensive
  .map(order => order.price * order.qty)    // calculate line total
  .reduce((total, lineTotal) => total + lineTotal, 0); // sum

console.log("Revenue:", revenue); // 2800

// Get sorted product names from paid orders:
const paidProducts = orders
  .filter(o => o.paid)
  .map(o => o.product)
  .sort();
console.log(paidProducts); // ["Laptop", "Tablet", "Watch"]


// ══════════════════════════════════════════════════════════════════
// § 4 — CUSTOM HOFs YOU SHOULD KNOW
// ══════════════════════════════════════════════════════════════════

// ── once() — run a function only once ────────────────────────────
function once(fn) {
  let called = false;
  let result;
  return function(...args) {
    if (!called) {
      called  = true;
      result  = fn(...args);
    }
    return result;
  };
}
const initOnce = once(() => {
  console.log("Initializing...");
  return { initialized: true };
});
initOnce(); // "Initializing..."
initOnce(); // silent — second call ignored
initOnce(); // silent

// ── memoize() — cache results ────────────────────────────────────
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}
const expensiveCalc = memoize((n) => {
  console.log(`Computing for ${n}...`);
  return n * n * n;
});
console.log(expensiveCalc(5));  // "Computing for 5..." → 125
console.log(expensiveCalc(5));  // (cache hit) → 125
console.log(expensiveCalc(10)); // "Computing for 10..." → 1000

// ── debounce() — delay until quiet ──────────────────────────────
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
const onSearch = debounce((query) => {
  console.log("Searching for:", query);
}, 300);
// onSearch("h")   ← cancelled
// onSearch("he")  ← cancelled
// onSearch("hel") ← fires after 300ms silence

// ── throttle() — limit rate of execution ─────────────────────────
function throttle(fn, limit) {
  let lastRun = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      lastRun = now;
      return fn.apply(this, args);
    }
  };
}
const onScroll = throttle(() => console.log("Scroll!"), 200);
// Fires at most once per 200ms no matter how fast user scrolls


// ══════════════════════════════════════════════════════════════════
// § 5 — HOFs IN REAL BACKEND/REACT CODE
// ══════════════════════════════════════════════════════════════════

// ── Express middleware (takes fn, returns fn) ──────────────────────
function requireAuth(handler) {
  return function(req, res, next) {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return handler(req, res, next);
  };
}
// const getProfile = requireAuth((req, res) => res.json({ user: req.user }));

// ── React HOC (takes component, returns component) ────────────────
// function withLoading(Component) {
//   return function WithLoadingWrapper({ isLoading, ...props }) {
//     if (isLoading) return <Spinner />;
//     return <Component {...props} />;
//   };
// }
// const UserListWithLoading = withLoading(UserList);

// ── Data transformation pipeline ─────────────────────────────────
const rawUsers = [
  { firstName: "alice", lastName: "SMITH",  age: 17, active: true  },
  { firstName: "BOB",   lastName: "jones",  age: 25, active: false },
  { firstName: "carol", lastName: "Wilson", age: 30, active: true  },
];

const processUsers = (users) =>
  users
    .filter(u => u.active)                    // active only
    .filter(u => u.age >= 18)                 // adults only
    .map(u => ({                              // normalize
      name: `${u.firstName} ${u.lastName}`
        .split(" ")
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      age: u.age,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // sort A-Z

console.log(processUsers(rawUsers));
// [{ name: "Carol Wilson", age: 30 }]


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is a higher-order function? ─────────────────────────
// A function that takes another function as argument OR returns a function.
// Possible because JS treats functions as first-class values.
// Examples: map, filter, reduce, setTimeout, addEventListener, Promise.then.

// ── Q2. Implement map from scratch. ──────────────────────────────
// Loop through array, call callback(element, index, array) for each,
// push result to new array, return new array.

// ── Q3. What is the difference between map and forEach? ──────────
// map returns a NEW array of transformed values.
// forEach returns undefined — used only for side effects (console.log, DOM updates).
// Use map when you need the result. Use forEach for pure side effects.

// ── Q4. Implement reduce from scratch. ───────────────────────────
// Start with initialValue as accumulator. Loop, calling callback(acc, el, i, arr).
// Each return becomes the new acc. Return final acc.

// ── Q5. What does once() do and where is it used? ────────────────
// Returns a wrapper that calls the original fn ONLY on first invocation.
// Subsequent calls return the cached result. Used for: init functions,
// lazy loading, ensuring side effects happen only once.

// ── Q6. What is the difference between debounce and throttle? ────
// Debounce: waits until the function hasn't been called for X ms, THEN fires.
// Used for: search input (wait until user stops typing).
// Throttle: fires at most once per X ms regardless of how often called.
// Used for: scroll/resize handlers, button clicks, API rate limiting.

// ── Q7. What is middleware in Express terms of HOF? ──────────────
// Middleware is a HOF — it takes a handler function and returns a new function
// that adds behavior (auth check, logging, validation) before/after calling
// the original handler. The composed result is a new, enhanced function.

// ── Q8. What is the difference between map and flatMap? ──────────
// map returns nested arrays if callback returns arrays.
// flatMap does map + one level of flatten:
// [1,2,3].map(n => [n, n*2])     // [[1,2],[2,4],[3,6]]
// [1,2,3].flatMap(n => [n, n*2]) // [1,2,2,4,3,6]

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 05_pure-functions.js
// ══════════════════════════════════════════════════════════════════
