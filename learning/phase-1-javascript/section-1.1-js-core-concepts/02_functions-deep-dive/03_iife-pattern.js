// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  03_iife-pattern.js                    ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What IIFE is and WHY it was invented
//    • All syntax variations (classic, arrow, async)
//    • Use cases: private scope, init code, module pattern, avoid pollution
//    • IIFE with parameters and return values
//    • IIFE vs ES Modules (when to use which today)
//    • Real-world examples from popular libraries
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS AN IIFE?
// ══════════════════════════════════════════════════════════════════
//
// IIFE = Immediately Invoked Function Expression
//
// A function that is DEFINED and CALLED at the same time.
// It runs ONCE, its scope is PRIVATE, and it CANNOT be called again.
//
// Why it exists:
//   Before ES Modules (pre-2015), ALL JavaScript shared the same global scope.
//   Multiple script files could step on each other's variables.
//   IIFE was THE solution — wrap your entire file in an IIFE to
//   create private scope and prevent global pollution.
//
// jQuery, Lodash, Moment.js — all wrapped in IIFEs.

// ══════════════════════════════════════════════════════════════════
// § 2 — SYNTAX VARIATIONS
// ══════════════════════════════════════════════════════════════════

// ── Classic style (most common) ──────────────────────────────────
(function() {
  const secret = "private";
  console.log("Classic IIFE ran:", secret);
})(); // ← the () at the end INVOKES it immediately

// ── Alternative grouping (also valid) ────────────────────────────
(function() {
  console.log("Alternative IIFE syntax ran");
}()); // Douglas Crockford's preferred style — invocation inside parens

// ── Arrow function IIFE ───────────────────────────────────────────
(() => {
  const msg = "Arrow IIFE";
  console.log(msg);
})();

// ── Async IIFE (very common in modern code) ───────────────────────
// When you need `await` at the top level but can't use top-level await:
(async () => {
  // await someApiCall();  ← works here!
  console.log("Async IIFE — can use await inside");
})();

// ── Named IIFE (for better stack traces) ─────────────────────────
(function initApp() {
  console.log("Named IIFE — shows 'initApp' in stack traces");
})();

// ── IIFE with semicolon guard ─────────────────────────────────────
// In files WITHOUT semicolons, a leading ; prevents IIFE from being
// treated as argument of the previous expression:
;(() => {
  console.log("Defensive IIFE with leading semicolon");
})();


// ══════════════════════════════════════════════════════════════════
// § 3 — IIFE WITH PARAMETERS AND RETURN VALUES
// ══════════════════════════════════════════════════════════════════

// ── IIFE with parameters ─────────────────────────────────────────
// Pass in global objects to "import" them safely and alias them:
(function($, window, document, undefined) {
  // Inside here:
  //   $ is guaranteed to be jQuery (even if someone overwrote $ outside)
  //   window/document are local aliases (minifiers can shorten them)
  //   `undefined` is truly undefined (in old browsers it could be overwritten!)
  console.log("Received $:", typeof $); // "undefined" (no jQuery, just demo)
})(undefined, globalThis, undefined);

// ── IIFE with return value ────────────────────────────────────────
const config = (function() {
  const ENV    = "production";
  const DEBUG  = ENV !== "production";
  const API_V  = "v2";

  return {
    env:      ENV,
    debug:    DEBUG,
    apiBase:  `https://api.example.com/${API_V}`,
    timeout:  5000,
  };
})();

console.log(config.env);     // "production"
console.log(config.apiBase); // "https://api.example.com/v2"
// console.log(ENV);          // ❌ ReferenceError — private!

// ── IIFE that conditionally returns ──────────────────────────────
const storage = (function() {
  try {
    localStorage.setItem("_test", "1");
    localStorage.removeItem("_test");
    return localStorage; // real localStorage available
  } catch(e) {
    // localStorage not available (private mode, etc.)
    const memStorage = {};
    return {
      setItem: (k, v) => (memStorage[k] = v),
      getItem: (k)    => memStorage[k] ?? null,
      removeItem: (k) => delete memStorage[k],
    };
  }
})();

storage.setItem("user", "Alice");
console.log(storage.getItem("user")); // "Alice" ✅ works in any environment


// ══════════════════════════════════════════════════════════════════
// § 4 — USE CASE 1: PRIVATE SCOPE / PREVENT GLOBAL POLLUTION
// ══════════════════════════════════════════════════════════════════

// Without IIFE — all variables leak to global scope:
// var version = "1.0";
// var db = connect();
// var utils = {};
// → All on window! Conflict with any other script.

// With IIFE — everything contained:
(function() {
  var version = "1.0";       // not global
  var dbConfig = { host: "localhost" }; // not global
  var utils    = {};         // not global

  // expose ONLY what consumers need:
  globalThis.MyLibrary = {
    version,
    getDb: () => dbConfig,   // controlled access
  };
})();

console.log(globalThis.MyLibrary?.version); // "1.0" ✅
// console.log(version);    // ❌ — private


// ══════════════════════════════════════════════════════════════════
// § 5 — USE CASE 2: ONE-TIME INITIALIZATION
// ══════════════════════════════════════════════════════════════════

const AppState = (function() {
  let initialized = false;
  let _users = [];
  let _settings = {};

  // This setup code runs ONCE immediately:
  _settings = { theme: "dark", lang: "en", version: "3.0" };
  console.log("AppState: initialization complete");

  return {
    isInitialized: () => initialized,
    getSettings:   () => ({ ..._settings }), // return copy, not reference
    addUser:       (u) => _users.push(u),
    getUsers:      () => [..._users],
  };
})();

AppState.addUser({ name: "Alice" });
console.log(AppState.getUsers());    // [{ name: "Alice" }]
console.log(AppState.getSettings()); // { theme: "dark", ... }


// ══════════════════════════════════════════════════════════════════
// § 6 — USE CASE 3: MODULE PATTERN WITH IIFE
// ══════════════════════════════════════════════════════════════════

// Classic "Revealing Module Pattern" — expose only public API
const ShoppingCart = (function() {
  // PRIVATE
  let items = [];
  let discount = 0;

  function _calculateTotal() {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    return subtotal * (1 - discount);
  }

  function _validateItem(item) {
    return item && item.name && item.price > 0 && item.qty > 0;
  }

  // PUBLIC
  return {
    addItem(item) {
      if (!_validateItem(item)) return console.log("Invalid item");
      items.push(item);
      console.log(`Added: ${item.name}`);
    },
    removeItem(name) {
      items = items.filter(i => i.name !== name);
    },
    applyDiscount(percent) {
      discount = percent / 100;
    },
    checkout() {
      const total = _calculateTotal();
      console.log(`Total: $${total.toFixed(2)}`);
      items = [];
      discount = 0;
      return total;
    },
    itemCount() { return items.length; },
  };
})();

ShoppingCart.addItem({ name: "Book",  price: 20, qty: 2 });
ShoppingCart.addItem({ name: "Pen",   price: 3,  qty: 5 });
ShoppingCart.applyDiscount(10); // 10% off
ShoppingCart.checkout();        // Total: $49.50
// console.log(items);           // ❌ ReferenceError — private!


// ══════════════════════════════════════════════════════════════════
// § 7 — USE CASE 4: LOOP VARIABLE CAPTURE (pre-ES6 closure fix)
// ══════════════════════════════════════════════════════════════════

// The classic var-in-loop bug fix via IIFE (pre-ES6):
for (var i = 0; i < 3; i++) {
  (function(captured) {
    setTimeout(() => {
      console.log("IIFE loop fix:", captured); // 0, 1, 2 ✅
    }, captured * 100);
  })(i);
}
// Modern fix (ES6): just use let. But knowing the IIFE fix proves deep understanding.


// ══════════════════════════════════════════════════════════════════
// § 8 — USE CASE 5: ASYNC TOP-LEVEL CODE
// ══════════════════════════════════════════════════════════════════

// In non-module environments (CommonJS, old browsers), you can't use
// top-level `await`. Async IIFE solves this:

(async function bootstrapApp() {
  try {
    // Simulate async initialization
    const config = await Promise.resolve({ db: "localhost", port: 5432 });
    console.log("App bootstrapped with config:", config);
    // Start app here...
  } catch(error) {
    console.error("Bootstrap failed:", error);
    process?.exit?.(1);
  }
})();

// In modern ES Modules, you can just use top-level await directly:
// const config = await loadConfig(); // works in module context


// ══════════════════════════════════════════════════════════════════
// § 9 — IIFE vs ES MODULES (what to use today)
// ══════════════════════════════════════════════════════════════════
//
//  ┌─────────────────────┬──────────────────┬──────────────────────┐
//  │ Feature             │      IIFE         │    ES Modules         │
//  ├─────────────────────┼──────────────────┼──────────────────────┤
//  │ Private scope       │ ✅ Yes            │ ✅ Yes (file scope)  │
//  │ Explicit exports    │ Manual (return)  │ `export` keyword      │
//  │ Tree shaking        │ ❌ No             │ ✅ Yes               │
//  │ Lazy loading        │ ❌ No             │ ✅ Dynamic import()  │
//  │ Circular deps       │ Manual           │ ✅ Native support    │
//  │ When to use         │ Legacy / polyfills│ All modern code      │
//  └─────────────────────┴──────────────────┴──────────────────────┘
//
// Modern rule: Use ES Modules for everything.
// Use IIFE when: working with legacy code, writing polyfills, needing
// async initialization in non-module context, library bundles.


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is an IIFE? Why was it invented? ────────────────────
//
// IIFE = Immediately Invoked Function Expression. A function defined
// and executed in the same step. Invented to solve global scope pollution
// before ES Modules existed. Wrapping code in an IIFE creates a private
// scope — variables inside cannot pollute or conflict with other scripts.

// ── Q2. What is the syntax for an IIFE? ─────────────────────────
//
// The function must be an EXPRESSION (not a declaration), wrapped in ():
//   (function() { ... })()   ← classic
//   (() => { ... })()        ← arrow IIFE
//   (async () => { ... })()  ← async IIFE
// The outer () prevents the `function` keyword from being parsed as a
// declaration. The trailing () invokes it.

// ── Q3. Why use IIFE instead of just a regular function call? ────
//
// An IIFE executes ONCE and is IMMEDIATELY discarded — it cannot be
// called again (no reference). This enforces one-time init semantics.
// The function name (if any) is not exposed to outer scope.
// It creates a clean disposal pattern.

// ── Q4. How does IIFE help with the var loop bug? ────────────────
//
// Wrap the loop body in an IIFE, passing `i` as argument. This creates
// a new scope per iteration with a COPY of `i`. Each callback closes
// over its own `captured` value instead of the shared `i`.

// ── Q5. Can an IIFE return a value? ──────────────────────────────
//
// Yes. Whatever the IIFE returns can be captured:
//   const result = (function() { return 42; })();
// This is how the module pattern works — IIFE returns a public API object
// while keeping private variables in its closed-over scope.

// ── Q6. What is the difference between IIFE and a regular function call?
//
// Regular function: defined once, callable multiple times, name persists.
// IIFE: defined and called once, immediately discarded, no persistent reference.
// IIFE enforces the "run once" contract in a way regular functions don't.

// ── Q7. Is IIFE still relevant in 2024+? ─────────────────────────
//
// Less so for new code, but still relevant for:
// 1. Async IIFE as a workaround for top-level await in CommonJS.
// 2. Library bundles that need to work in non-module environments.
// 3. Legacy codebases that can't use ES Modules.
// 4. Polyfills and browser compatibility wrappers.
// Modern projects should use ES Modules with explicit export/import.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 04_higher-order-functions.js
// ══════════════════════════════════════════════════════════════════
