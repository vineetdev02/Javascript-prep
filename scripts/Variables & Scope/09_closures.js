// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  09_closures.js                          ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What a closure is (the real definition, not the textbook one)
//    • How closures are formed
//    • 8 practical use cases of closures
//    • Memory implications (closures keep scope alive)
//    • Memory leak pattern + how to fix it
//    • The classic closure-in-loop bug (var) + all 3 fixes
//    • Module pattern using closures
//    • Memoization using closures
//    • 10 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS A CLOSURE?
// ══════════════════════════════════════════════════════════════════
//
// Textbook definition:
//   "A closure is a function that has access to variables from its
//    outer (enclosing) scope even after that outer scope has returned."
//
// Better way to think about it:
//   A closure = a function + its BACKPACK.
//   The backpack contains references to all outer scope variables
//   the function uses. The function carries this backpack everywhere.
//   Even when the outer function is gone, the backpack stays.
//
// ALL functions in JavaScript are closures.
// Every function captures its surrounding scope at creation.
// Most of the time you don't notice. But when you RETURN a function
// or store it for later, the closure becomes visible.

function outer() {
  const secret = "I'm in the backpack!"; // outer scope variable

  function inner() {
    // inner() was DEFINED where `secret` exists.
    // It "closes over" secret — captures it in its backpack.
    console.log(secret); // accessible even after outer() returns
  }

  return inner; // return the function — backpack comes with it!
}

const closureFn = outer(); // outer() has RETURNED, but...
closureFn();                // "I'm in the backpack!" ← still works!
// `secret` lives on in memory because closureFn holds a reference to it.


// ══════════════════════════════════════════════════════════════════
// § 2 — HOW CLOSURES ARE FORMED
// ══════════════════════════════════════════════════════════════════
//
// A closure is formed every time a function is CREATED inside another scope.
// The inner function gets a reference to the outer scope's environment.
// If the inner function is returned or stored → closure is observable.
//
// Three conditions for a noticeable closure:
//   1. An inner function is defined inside an outer function
//   2. The inner function references variables from the outer scope
//   3. The inner function is accessible OUTSIDE the outer function
//      (returned, stored in variable, passed as callback, etc.)

function createCounter() {
  let count = 0; // outer scope variable — will be closed over

  function increment() { return ++count; } // references outer `count`
  function decrement() { return --count; } // references outer `count`
  function reset()     { count = 0; return count; }
  function value()     { return count; }

  // Return all — each function closes over the SAME `count` variable
  return { increment, decrement, reset, value };
}

const counter = createCounter(); // createCounter has returned
counter.increment(); // 1 — count remembered!
counter.increment(); // 2
counter.increment(); // 3
counter.decrement(); // 2
console.log(counter.value()); // 2
counter.reset();
console.log(counter.value()); // 0


// ══════════════════════════════════════════════════════════════════
// § 3 — CLOSURES SHARE SCOPE  (they share the SAME variable)
// ══════════════════════════════════════════════════════════════════
//
// Multiple closures created from the same outer function
// share the SAME outer scope variables — they're not copies!

function sharedScope() {
  let shared = 0;

  const up   = () => ++shared;
  const down = () => --shared;
  const peek = () => shared;

  return { up, down, peek };
}

const { up, down, peek } = sharedScope();

up();  up();  up(); // shared = 3
down();             // shared = 2
console.log(peek()); // 2 — all three functions modify the SAME `shared` ✅

// ── Separate instances get SEPARATE copies ───────────────────────
const counter1 = createCounter(); // independent `count`
const counter2 = createCounter(); // independent `count`

counter1.increment(); // counter1.count = 1
counter1.increment(); // counter1.count = 2
counter2.increment(); // counter2.count = 1

console.log(counter1.value()); // 2
console.log(counter2.value()); // 1 — completely independent ✅


// ══════════════════════════════════════════════════════════════════
// § 4 — PRACTICAL USE CASE 1: DATA PRIVACY (Module Pattern)
// ══════════════════════════════════════════════════════════════════
//
// Closures give you PRIVATE variables — something JS didn't have
// natively until ES2022 private fields (#).
// This pattern is called the "Module Pattern" or "Revealing Module Pattern".

const UserAuth = (function() {
  // PRIVATE — not accessible from outside
  let _token    = null;
  let _username = null;
  let _loginAttempts = 0;
  const MAX_ATTEMPTS = 3;

  // PRIVATE function
  function _validatePassword(password) {
    return password.length >= 8; // simplified
  }

  // PUBLIC API — only what we choose to expose
  return {
    login(username, password) {
      if (_loginAttempts >= MAX_ATTEMPTS) {
        return { success: false, message: "Account locked" };
      }
      if (!_validatePassword(password)) {
        _loginAttempts++;
        return { success: false, message: "Password too short" };
      }
      _token    = `token_${Math.random().toString(36).slice(2)}`;
      _username = username;
      _loginAttempts = 0;
      return { success: true, message: "Logged in!" };
    },
    logout() {
      _token    = null;
      _username = null;
    },
    isLoggedIn() { return _token !== null; },
    getUsername() { return _username; },
  };
})();

console.log(UserAuth.login("Alice", "password123")); // { success: true }
console.log(UserAuth.isLoggedIn());   // true
console.log(UserAuth.getUsername());  // "Alice"
// console.log(UserAuth._token);      // undefined — private! ✅


// ══════════════════════════════════════════════════════════════════
// § 5 — PRACTICAL USE CASE 2: FACTORY FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function createMultiplier(factor) {
  return (number) => number * factor; // `factor` closed over
}

const double  = createMultiplier(2);
const triple  = createMultiplier(3);
const tenX    = createMultiplier(10);

console.log(double(5));  // 10
console.log(triple(5));  // 15
console.log(tenX(5));    // 50

// Each function has its own independent `factor` in its backpack.

function createApiCaller(baseUrl, apiKey) {
  // Both `baseUrl` and `apiKey` are private to each instance
  return async function(endpoint) {
    const url = `${baseUrl}${endpoint}`;
    // const response = await fetch(url, {
    //   headers: { Authorization: `Bearer ${apiKey}` }
    // });
    console.log(`Calling: ${url} with key ${apiKey}`);
  };
}

const prodAPI = createApiCaller("https://api.prod.com", "prod-key-123");
const devAPI  = createApiCaller("https://api.dev.com",  "dev-key-456");

prodAPI("/users");  // Calling: https://api.prod.com/users with key prod-key-123
devAPI("/users");   // Calling: https://api.dev.com/users with key dev-key-456


// ══════════════════════════════════════════════════════════════════
// § 6 — PRACTICAL USE CASE 3: MEMOIZATION (caching)
// ══════════════════════════════════════════════════════════════════
//
// Memoization = caching the results of expensive function calls.
// The cache lives in the closure scope — private and persistent.

function memoize(fn) {
  const cache = {}; // this cache lives in closure scope

  return function(...args) {
    const key = JSON.stringify(args);

    if (key in cache) {
      console.log(`Cache hit for ${key}`);
      return cache[key];
    }

    console.log(`Computing for ${key}`);
    const result = fn(...args);
    cache[key] = result;
    return result;
  };
}

// Expensive fibonacci (recursive, no optimization):
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const memoFib = memoize(fibonacci);
console.log(memoFib(40)); // Computing... (first time)
console.log(memoFib(40)); // Cache hit! (instant)
console.log(memoFib(40)); // Cache hit! (instant)


// ══════════════════════════════════════════════════════════════════
// § 7 — PRACTICAL USE CASE 4: PARTIAL APPLICATION & CURRYING
// ══════════════════════════════════════════════════════════════════

// Partial application: pre-fill some arguments, return function for rest
function multiply(a, b) {
  return a * b;
}

function partial(fn, ...presetArgs) {
  return function(...remainingArgs) {
    return fn(...presetArgs, ...remainingArgs); // preset args closed over
  };
}

const double2  = partial(multiply, 2);
const triple2  = partial(multiply, 3);

console.log(double2(7)); // 14
console.log(triple2(7)); // 21

// Currying: transform f(a, b, c) → f(a)(b)(c)
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn(...args); // all args provided — execute
    }
    return function(...moreArgs) {
      return curried(...args, ...moreArgs); // close over args, wait for more
    };
  };
}

const curriedAdd = curry((a, b, c) => a + b + c);
console.log(curriedAdd(1)(2)(3));    // 6
console.log(curriedAdd(1, 2)(3));    // 6
console.log(curriedAdd(1)(2, 3));    // 6
console.log(curriedAdd(1, 2, 3));    // 6


// ══════════════════════════════════════════════════════════════════
// § 8 — PRACTICAL USE CASE 5: EVENT HANDLERS WITH STATE
// ══════════════════════════════════════════════════════════════════

function setupClickTracker(buttonId) {
  let clickCount = 0; // private state per button

  return function handleClick() {
    clickCount++;
    console.log(`Button "${buttonId}" clicked ${clickCount} time(s)`);
    if (clickCount === 3) {
      console.log(`"${buttonId}" reached 3 clicks!`);
    }
  };
}

const btnAHandler = setupClickTracker("submit");
const btnBHandler = setupClickTracker("cancel");

btnAHandler(); // Button "submit" clicked 1 time(s)
btnAHandler(); // Button "submit" clicked 2 time(s)
btnBHandler(); // Button "cancel" clicked 1 time(s)  ← independent!
btnAHandler(); // Button "submit" clicked 3 time(s)


// ══════════════════════════════════════════════════════════════════
// § 9 — THE CLASSIC CLOSURE BUG: var IN A LOOP
// ══════════════════════════════════════════════════════════════════

// ── THE BUG ──────────────────────────────────────────────────────
for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log("BUGGY var loop:", i); // 3, 3, 3 ❌
  }, i * 100);
}
// WHY? var i is function-scoped. Only ONE `i` exists.
// All three closures close over the SAME `i`.
// By the time setTimeout fires, loop has completed → i === 3.

// ── FIX 1: Use let (a new binding per iteration) ─────────────────
for (let l = 0; l < 3; l++) {
  setTimeout(() => {
    console.log("FIXED let loop:", l); // 0, 1, 2 ✅
  }, 300 + l * 100);
}
// WHY? let is block-scoped. Each iteration creates a NEW `l`.
// Each closure closes over a DIFFERENT `l`.

// ── FIX 2: IIFE — create a new scope per iteration ───────────────
for (var v = 0; v < 3; v++) {
  (function(captured) {
    setTimeout(() => {
      console.log("FIXED IIFE loop:", captured); // 0, 1, 2 ✅
    }, 600 + captured * 100);
  })(v); // pass current v as argument — captured is a new variable
}

// ── FIX 3: .bind() — bind current value ──────────────────────────
function logValue(val) {
  console.log("FIXED bind loop:", val); // 0, 1, 2 ✅
}
for (var b = 0; b < 3; b++) {
  setTimeout(logValue.bind(null, b), 900 + b * 100);
}


// ══════════════════════════════════════════════════════════════════
// § 10 — MEMORY IMPLICATIONS OF CLOSURES
// ══════════════════════════════════════════════════════════════════
//
// Closures KEEP OUTER SCOPE VARIABLES ALIVE in memory.
// The garbage collector cannot free them while the closure exists.
// This is usually fine — but can cause MEMORY LEAKS if not managed.

// ── Memory leak pattern ───────────────────────────────────────────
function createLeakRisk() {
  const largeData = new Array(1000000).fill("💾"); // 1M items

  return function() {
    // This function closes over `largeData`.
    // Even if you only use one tiny piece, the ENTIRE largeData stays in memory
    // as long as this function exists.
    console.log(largeData[0]);
  };
}

const leakyFn = createLeakRisk(); // largeData stays in memory
// leakyFn = null; // ← setting to null allows GC to free largeData

// ── Fix: nullify closures you no longer need ─────────────────────
let possiblyLeaky = (function() {
  const bigBuffer = new Array(100000).fill(0);
  return () => bigBuffer.length;
})();

console.log(possiblyLeaky()); // 100000
possiblyLeaky = null; // ← allows GC to clean up bigBuffer ✅


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is a closure? ───────────────────────────────────────
//
// A closure is a function that retains access to its outer (lexical)
// scope even after the outer function has returned. In JS, every
// function is technically a closure. A closure becomes observable
// when a function is returned, stored, or passed as a callback —
// and it still accesses variables from where it was defined.

// ── Q2. Give 3 real-world use cases of closures. ─────────────────
//
// 1. Data privacy: the module pattern creates private variables
//    inaccessible from outside, exposed only via a public API.
// 2. Factory functions: create multiple independent instances,
//    each with their own private state (e.g., createCounter()).
// 3. Memoization: cache previous results in a private `cache` object
//    that persists between calls without polluting outer scope.

// ── Q3. Classic interview: what does this print? ─────────────────
//
//   for (var i = 0; i < 3; i++) {
//     setTimeout(() => console.log(i), 0);
//   }
//
// Answer: 3, 3, 3
// var i is shared. All closures reference the same i. After the loop,
// i === 3. Fix: use let (new binding per iteration).

// ── Q4. Do closures share scope? ────────────────────────────────
//
// YES — closures created from the same outer function share the SAME
// outer scope variables, not copies. So increment() and decrement()
// from the same createCounter() both modify the SAME `count` variable.
// But two separate calls to createCounter() create INDEPENDENT counters.

// ── Q5. Can closures cause memory leaks? ────────────────────────
//
// Yes. A closure keeps its closed-over variables alive in memory as
// long as the closure itself exists. If you store a closure that
// references a large object, that object cannot be garbage collected.
// Fix: set the closure reference to null when you're done with it.

// ── Q6. What is the module pattern? ─────────────────────────────
//
// The module pattern uses an IIFE to create a private scope, then
// returns an object exposing only selected functions. The private
// variables are accessible only to the returned functions via closure.
// This was the pre-ES6 way to create modules with private state.

// ── Q7. What is the difference between a closure and a callback? ─
//
// A callback is any function passed as an argument to be called later.
// A closure is a function that captures its outer scope.
// All closures are functions. Many callbacks ARE closures (if they
// access outer variables), but not all callbacks are closures.

// ── Q8. How does memoization use closures? ───────────────────────
//
// A memoize function returns a wrapper function. The wrapper closes
// over a `cache` object. Each time it's called, it checks the cache.
// If found (cache hit): returns cached result. If not: computes,
// stores in cache, returns result. The cache persists between calls
// because it's in the closed-over scope.

// ── Q9. Can you have a closure without a nested function? ────────
//
// Technically, a closure requires a function and its captured environment.
// A function at global scope technically closes over the global environment,
// but that's usually not what people mean. In practice, closures are
// discussed when an inner function captures variables from an outer function.

// ── Q10. What is the output? (advanced) ──────────────────────────
//
//   function makeAdder(x) {
//     return function(y) {
//       return x + y;
//     };
//   }
//   const add5  = makeAdder(5);
//   const add10 = makeAdder(10);
//   console.log(add5(3));   // ?
//   console.log(add10(3));  // ?
//   console.log(add5(10));  // ?
//
// Answer: 8, 13, 15
// add5 closes over x=5. add10 closes over x=10. They're independent.
// add5(3)  → 5+3  = 8
// add10(3) → 10+3 = 13
// add5(10) → 5+10 = 15

// ══════════════════════════════════════════════════════════════════
// 🏁 VARIABLES & SCOPE — COMPLETE!
//    You now know everything needed to ace Google, Apple,
//    Wipro, Infosys interviews on this topic.
//
// ✅ Review checklist:
//    □ var vs let vs const (all edge cases)
//    □ Hoisting (var, let, const, fn declarations, fn expressions)
//    □ Temporal Dead Zone (including typeof trap)
//    □ Block scope vs Function scope (var leaking)
//    □ Global scope pollution (dangers + all prevention methods)
//    □ Variable shadowing (good uses vs accidental bugs + TDZ trap)
//    □ Lexical scoping (definition site > call site)
//    □ Scope chain (lookup algorithm, vs prototype chain)
//    □ Closures (definition, 8 use cases, memory, loop bug)
//
// 📚 NEXT TOPIC → Functions Deep Dive
// ══════════════════════════════════════════════════════════════════
