// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  07_currying.js                        ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: What currying is, why it exists, manual currying,
//    generic curry(), real use cases, vs partial application, 8 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS CURRYING?
// ══════════════════════════════════════════════════════════════════
// Currying = transforming a function that takes N arguments into a
// chain of N functions that each take ONE argument.
//
// Normal:  f(a, b, c)     → single call with all args
// Curried: f(a)(b)(c)     → chain of calls, one arg at a time
//
// Named after mathematician Haskell Curry.
// Core concept in functional programming.
// Enables reusable specialized functions.

// ── Before currying ───────────────────────────────────────────────
function addNormal(a, b, c) { return a + b + c; }
console.log(addNormal(1, 2, 3)); // 6

// ── After currying (manual) ───────────────────────────────────────
function addCurried(a) {
  return function(b) {
    return function(c) {
      return a + b + c;
    };
  };
}
// Or with arrows (concise):
const addArrow = a => b => c => a + b + c;

console.log(addCurried(1)(2)(3)); // 6
console.log(addArrow(1)(2)(3));   // 6

// ── Creating specialized functions via partial application ────────
const add1     = addArrow(1);       // a=1, waiting for b and c
const add1and2 = addArrow(1)(2);    // a=1, b=2, waiting for c

console.log(add1(2)(3));   // 6
console.log(add1and2(3));  // 6
console.log(add1and2(10)); // 13 — reusable!


// ══════════════════════════════════════════════════════════════════
// § 2 — GENERIC curry() IMPLEMENTATION
// ══════════════════════════════════════════════════════════════════
// Automatically curry any function of any arity (number of arguments)

function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      // All arguments received — call the original function
      return fn.apply(this, args);
    }
    // Not enough args yet — return a function collecting more
    return function(...moreArgs) {
      return curried.apply(this, [...args, ...moreArgs]);
    };
  };
}

// Test with a 3-argument function:
const volume = curry((l, w, h) => l * w * h);

console.log(volume(2)(3)(4));    // 24 — one at a time
console.log(volume(2, 3)(4));    // 24 — two then one
console.log(volume(2)(3, 4));    // 24 — one then two
console.log(volume(2, 3, 4));    // 24 — all at once
console.log(volume(2, 3, 4));    // 24

// ── fn.length gotcha ─────────────────────────────────────────────
// fn.length = the number of DECLARED parameters (not including rest/defaults)
function withRest(a, b, ...c) {}
console.log(withRest.length); // 2 — rest params don't count!

function withDefault(a, b = 1) {}
console.log(withDefault.length); // 1 — params after default don't count!


// ══════════════════════════════════════════════════════════════════
// § 3 — REAL-WORLD USE CASES
// ══════════════════════════════════════════════════════════════════

// ── Use case 1: Reusable event handlers ──────────────────────────
const on = curry((event, selector, handler) => {
  document.querySelector(selector)
    ?.addEventListener(event, handler);
});

const onClick  = on("click");          // specialized for click
const onChange = on("change");         // specialized for change
// const onBtnClick = onClick("#myBtn"); // specialized for specific button
// onBtnClick(handleClick);             // attach handler

// ── Use case 2: Validation pipeline ──────────────────────────────
const validate = curry((rule, message, value) => {
  return rule(value) ? null : message;
});

const requiredRule   = validate((v) => v !== "" && v != null, "Required field");
const minLengthRule  = validate((v) => v.length >= 3,         "Min 3 characters");
const emailRule      = validate((v) => /\S+@\S+\.\S+/.test(v),"Invalid email");

console.log(requiredRule("Alice"));        // null  ✅ valid
console.log(requiredRule(""));             // "Required field"
console.log(minLengthRule("Al"));          // "Min 3 characters"
console.log(emailRule("bad-email"));       // "Invalid email"

// ── Use case 3: API request builder ──────────────────────────────
const apiRequest = curry(async (baseUrl, method, endpoint, data) => {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    body: data ? JSON.stringify(data) : null,
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
});

const prodApi = apiRequest("https://api.prod.com");
const devApi  = apiRequest("https://api.dev.com");

const get    = prodApi("GET");
const post   = prodApi("POST");

// const users     = await get("/users");
// const newUser   = await post("/users", { name: "Alice" });

// ── Use case 4: Logger with context ──────────────────────────────
const log = curry((level, module, message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] [${module}] ${message}`);
});

const info  = log("INFO");
const error = log("ERROR");
const warn  = log("WARN");

const authLog = info("AuthService");
const dbLog   = error("Database");

authLog("User logged in");       // [INFO] [AuthService] User logged in
dbLog("Connection timeout");     // [ERROR] [Database] Connection timeout


// ══════════════════════════════════════════════════════════════════
// § 4 — CURRYING vs PARTIAL APPLICATION
// ══════════════════════════════════════════════════════════════════
//
// CURRYING: ALWAYS takes exactly ONE argument at a time.
//           Transform f(a,b,c) → f(a)(b)(c)
//           Every step returns a unary function (one argument)
//
// PARTIAL APPLICATION: Pre-fill ONE OR MORE arguments at once.
//           Transform f(a,b,c) → f(a,b)(c) or f(a)(b,c)
//           More flexible — any number of args per step
//
// Currying is a SPECIAL CASE of partial application where each
// step takes exactly 1 argument.

// Curried (1 at a time):
const curriedAdd3 = a => b => c => a + b + c;
curriedAdd3(1)(2)(3); // only way

// Partial (flexible):
function partial(fn, ...preset) {
  return (...rest) => fn(...preset, ...rest);
}
const add3 = (a, b, c) => a + b + c;
const addFrom1    = partial(add3, 1);       // pre-fill 1 arg
const addFrom1and2 = partial(add3, 1, 2);   // pre-fill 2 args
console.log(addFrom1(2, 3));    // 6 — remaining 2 args at once
console.log(addFrom1and2(3));   // 6 — remaining 1 arg


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// Q1. What is currying?
// Transforming a function that takes multiple arguments into a chain of
// functions that each take ONE argument. f(a,b,c) → f(a)(b)(c).

// Q2. Why use currying?
// Create specialized reusable functions by pre-filling arguments.
// Enables point-free programming. Cleaner functional pipelines.
// Separates "configuration" phase from "execution" phase.

// Q3. What is fn.length?
// The number of formal declared parameters. Does NOT include rest parameters
// or parameters after a default value. Used by generic curry() to know
// how many args to wait for.

// Q4. What's the difference between currying and partial application?
// Currying: always 1 arg at a time. Partial: any number of args at once.
// Currying is a strict subset of partial application.

// Q5. Implement a generic curry() function.
// Check if received args >= fn.length. If yes: call fn with all args.
// If no: return a function that collects more args and calls curried again.

// Q6. Does JavaScript natively support currying?
// No. Unlike Haskell where all functions are automatically curried,
// JS requires explicit currying via manual syntax or a curry() helper.

// Q7. What is a unary function?
// A function that takes exactly ONE argument. Curried functions are
// always unary at each step. Important in functional programming because
// many array methods (map, filter) pass multiple args — be careful!

// Q8. What is point-free style?
// Writing functions without explicitly mentioning their arguments.
// Currying enables this: instead of `(x) => transform(x)`, just `transform`.
// Example: `[1,2,3].map(x => double(x))` → `[1,2,3].map(double)`

// 📚 NEXT → 08_partial-application.js
