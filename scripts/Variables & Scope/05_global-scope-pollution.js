// ╔══════════════════════════════════════════════════════════════════╗
// ║   Variables & Scope  →  05_global-scope-pollution.js            ║
// ║   Level: Junior → Google/Apple Senior                           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// 🎯 WHAT YOU WILL MASTER HERE:
//    • What the global scope is and how it works in browser vs Node
//    • What global scope pollution means and why it's dangerous
//    • window object and var attachment
//    • How it causes real bugs (name collisions, API overwrites)
//    • All the ways to PREVENT global scope pollution
//    • 7 interview questions with model answers
//
// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS THE GLOBAL SCOPE?
// ══════════════════════════════════════════════════════════════════
//
// Global scope = the outermost scope in a JavaScript environment.
// Variables declared here are accessible EVERYWHERE in your code.
//
// In BROWSER:  the global object is `window`
// In NODE.js:  the global object is `global`
// In BOTH:     you can use `globalThis` (ES2020 unified API)
//
// Anything you declare at the top level (not inside any function/block)
// goes into this global scope.

// Top-level declarations (all are "global" in a script context):
var   globalVar   = "I'm on window.globalVar (in browser)";
let   globalLet   = "I'm global but NOT on window";
const globalConst = "I'm global but NOT on window";

// In a browser console:
//   window.globalVar   === "I'm on window.globalVar"  ✅
//   window.globalLet   === undefined                  ✅ (safe)
//   window.globalConst === undefined                  ✅ (safe)


// ══════════════════════════════════════════════════════════════════
// § 2 — WHAT IS GLOBAL SCOPE POLLUTION?
// ══════════════════════════════════════════════════════════════════
//
// Global scope pollution = carelessly putting variables into global scope.
// It "pollutes" the shared namespace that ALL code shares.
//
// Think of it like a shared office whiteboard:
//   If everyone writes their notes on the SAME board (global scope),
//   people overwrite each other's notes → chaos.
//   The fix: give each person their own notebook (function/module scope).
//
// Causes of pollution:
//   1. Using var at the top level
//   2. Forgetting to declare a variable (implicit global — very bad)
//   3. Assigning to window.x = ... intentionally but unnecessarily
//   4. Using script tags instead of ES modules


// ══════════════════════════════════════════════════════════════════
// § 3 — DANGERS OF GLOBAL SCOPE POLLUTION
// ══════════════════════════════════════════════════════════════════

// ── Danger 1: Overwriting browser built-in APIs ──────────────────
//
// The `window` object has hundreds of built-in properties.
// A var declaration with the same name SILENTLY overwrites them.

// These are REAL window properties you can accidentally overwrite:
//   window.name     → holds the name of the window/frame
//   window.location → the URL object
//   window.history  → browser history API
//   window.status   → browser status bar text
//   window.document → the DOM document
//   window.screen   → screen info
//   window.event    → current event
//   window.frames   → array of iframes
//   window.length   → number of frames

// var name     = "Alice";  // ← overwrites window.name! All frames share this.
// var location = "/home";  // ← BREAKS window.location navigation!
// var history  = [];       // ← BREAKS window.history.pushState()!

// With let/const: NONE of these overwrite window:
let  safeNameVar  = "Alice";   // window.safeNameVar === undefined ✅
const safeLocConst = "/home";  // window.safeLocConst === undefined ✅

// ── Danger 2: Name collisions between script files ───────────────
//
// If you include multiple <script> tags without modules:
//
//   file1.js:  var config = { theme: "dark" };
//   file2.js:  var config = { theme: "light" };  // silently overwrites!
//
// The second file wins. No error. No warning.
// This caused massive bugs in the pre-module era.

// ── Danger 3: Third-party library conflicts ───────────────────────
//
// Popular library uses global var:  var $ = library;
// Your code uses:                   var $ = "my string";
// → Library breaks. No error.

// ── Danger 4: Implicit globals (worst case) ──────────────────────
//
// If you assign to a variable WITHOUT declaring it:
function createImplicitGlobal() {
  // "use strict"; // ← with strict mode, this throws ReferenceError
  
  accidentalGlobal = "I'm on window!"; // ← NO var/let/const!
  // In sloppy mode: JS creates window.accidentalGlobal silently
  // This is one of the most dangerous JS behaviors
}
createImplicitGlobal();
// console.log(accidentalGlobal); // ✅ visible globally — this is a bug!

// FIX: Always use "use strict" at top of files!
// In strict mode: accidentalGlobal = "x" → ReferenceError immediately


// ══════════════════════════════════════════════════════════════════
// § 4 — HOW TO PREVENT GLOBAL SCOPE POLLUTION
// ══════════════════════════════════════════════════════════════════

// ── Prevention 1: Use let/const instead of var ───────────────────
// let and const at global scope are visible globally but NOT attached to window
const appConfig = { theme: "dark", lang: "en" }; // global but safe

// ── Prevention 2: Use "use strict" ───────────────────────────────
"use strict"; // Prevents implicit globals. Put at top of every file.
// Now: undeclaredVar = "x" → throws ReferenceError (instead of silent global)

// ── Prevention 3: IIFE (Immediately Invoked Function Expression) ─
// Wraps all your code in a function → creates private scope
(function() {
  var  privateVar = "No one outside can see me";
  let  privateLet = "Me too";
  const privateConst = "Same here";
  
  // Your code runs here
  console.log("IIFE executed, variables contained");
})(); // ← immediately invoke

// console.log(privateVar); // ❌ ReferenceError — IIFE kept it private

// This was the STANDARD pattern before ES Modules (pre-2015).
// jQuery, Lodash, and many libraries are wrapped in IIFEs.

// ── Prevention 4: ES Modules ─────────────────────────────────────
// The MODERN and BEST solution.
// Each file is its own module scope.
// Nothing is global unless explicitly exported + imported.
//
// app.js  (type="module" in HTML):
//   const config = { ... };    ← NOT global, module-scoped
//   export function init() {}  ← explicitly share what you want
//
// utils.js:
//   import { init } from './app.js';  ← explicit dependency

// ── Prevention 5: Namespacing (old pattern, still seen) ──────────
// Group everything under ONE global object to minimize collisions:
const MyApp = {}; // One global variable instead of many

MyApp.config    = { theme: "dark" };
MyApp.utils     = {};
MyApp.models    = {};
MyApp.utils.formatDate  = (d) => d.toISOString();
MyApp.utils.formatPrice = (p) => `$${p.toFixed(2)}`;

// Only ONE global variable (MyApp) instead of config, utils, models, etc.
// Collision risk drops dramatically.

// ── Prevention 6: Closures for data privacy ─────────────────────
const bankAccount = (function() {
  let balance = 0; // ← private, not on window

  return {
    deposit(amount)  { balance += amount; },
    withdraw(amount) { balance -= amount; },
    getBalance()     { return balance; },
  };
})();

bankAccount.deposit(100);
bankAccount.deposit(50);
console.log(bankAccount.getBalance()); // 150
// console.log(balance); // ❌ ReferenceError — completely private


// ══════════════════════════════════════════════════════════════════
// § 5 — DETECTING AND DEBUGGING GLOBAL POLLUTION
// ══════════════════════════════════════════════════════════════════

// In browser DevTools console:
//   Object.keys(window) → lists all global variables
//   window.myVar       → check if specific var is global
//
// Linting tools (recommended):
//   ESLint rule: "no-var" → enforces let/const
//   ESLint rule: "no-implicit-globals" → prevents accidental globals
//   ESLint rule: "no-global-assign" → prevents overwriting built-ins
//
// TypeScript helps too:
//   Strict mode catches most accidental globals at compile time.


// ══════════════════════════════════════════════════════════════════
// § 6 — globalThis (modern unified API)
// ══════════════════════════════════════════════════════════════════
//
// ES2020 introduced globalThis as a standard way to access the global
// object in ANY environment:
//
//   Browser:    globalThis === window
//   Node.js:    globalThis === global
//   Web Worker: globalThis === self
//
// Useful for writing code that runs in both browser and Node:

function isInBrowser() {
  return typeof globalThis.window !== "undefined";
}
function isInNode() {
  return typeof globalThis.process !== "undefined";
}

// Setting a truly global variable (rarely needed, but correct way):
// globalThis.APP_VERSION = "2.0.0"; // ← explicit, at least you know it's global


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// ── Q1. What is global scope pollution? ─────────────────────────
//
// Adding too many variables to the global scope, making them accessible
// everywhere and increasing the risk of name collisions, accidental
// overwrites of browser APIs, and hard-to-trace bugs. It happens most
// often with var declarations at the top level or forgetting to
// declare variables at all (implicit globals).

// ── Q2. Why does var pollute the global scope more than let/const?
//
// var at the top level attaches to the window object (in browser).
// So `var name = "Alice"` becomes window.name = "Alice", silently
// overwriting the browser's built-in window.name property.
// let and const at the top level don't attach to window — they're
// global in visibility but don't overwrite window properties.

// ── Q3. What is an implicit global? How do you prevent it? ──────
//
// An implicit global is created when you assign to a variable without
// declaring it: `x = 5` inside a function creates window.x in sloppy mode.
// Prevention: use "use strict" at the top of every file. In strict mode,
// assigning to an undeclared variable throws a ReferenceError immediately.

// ── Q4. What is an IIFE and how does it prevent global pollution? ─
//
// IIFE = Immediately Invoked Function Expression. A function that is
// defined and called in the same expression: (function(){ ... })();
// It creates a new function scope. All var/let/const inside are
// invisible to the outside. This was the pre-ES6 standard pattern
// for libraries to avoid polluting the global scope. jQuery uses it.

// ── Q5. What is the modern solution to global scope pollution? ───
//
// ES Modules. With `<script type="module">` or Node.js .mjs files,
// each file is its own module scope. Top-level variables are not global.
// You must explicitly export what you want shared and import what you need.
// This completely solves the collision problem.

// ── Q6. How would you check if a variable is in global scope? ────
//
// In browser: check window.variableName
// In any environment: check globalThis.variableName
// Use ESLint with no-var + no-implicit-globals rules during development.

// ── Q7. What browser APIs can var accidentally overwrite? ────────
//
// window.name, window.location, window.history, window.status,
// window.document, window.screen, window.event, window.frames,
// window.length, window.top, window.parent, window.self, window.opener.
// Any top-level `var` with one of these names silently overwrites
// that browser API, causing mysterious failures elsewhere in your code.

// ══════════════════════════════════════════════════════════════════
// 📚 NEXT → 06_variable-shadowing.js
// ══════════════════════════════════════════════════════════════════
