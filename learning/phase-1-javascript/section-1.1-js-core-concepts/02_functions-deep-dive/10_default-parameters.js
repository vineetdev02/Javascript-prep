// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  10_default-parameters.js              ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: Default params syntax, undefined vs null trap, expressions
//    as defaults, interaction with arguments object, TDZ, 7 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT ARE DEFAULT PARAMETERS?
// ══════════════════════════════════════════════════════════════════
// ES6 feature: assign a fallback value to a parameter if it's
// `undefined` or not provided at all.
//
// Before ES6 (old pattern — don't use):
function greetOld(name) {
  name = name !== undefined ? name : "Guest"; // ← verbose, error-prone
  return `Hello, ${name}!`;
}

// ES6 default parameter (clean):
function greet(name = "Guest") {
  return `Hello, ${name}!`;
}
console.log(greet());           // "Hello, Guest!" — not provided
console.log(greet(undefined));  // "Hello, Guest!" — undefined triggers default
console.log(greet(null));       // "Hello, null!"  ← null does NOT trigger default!
console.log(greet("Alice"));    // "Hello, Alice!"
console.log(greet(""));         // "Hello, !"      ← empty string is not undefined

// ══════════════════════════════════════════════════════════════════
// § 2 — DEFAULTS CAN BE EXPRESSIONS (evaluated at call time)
// ══════════════════════════════════════════════════════════════════

function createId(prefix = "ID", timestamp = Date.now()) {
  return `${prefix}_${timestamp}`;
}
console.log(createId());           // "ID_<current_timestamp>" — different each call!
console.log(createId("USER"));     // "USER_<current_timestamp>"
console.log(createId("USER", 100)); // "USER_100" — provided, not evaluated

// Default can call a function:
function getDefaultTheme() { return "dark"; }
function initApp(theme = getDefaultTheme()) {
  return `App with ${theme} theme`;
}
console.log(initApp());       // "App with dark theme"
console.log(initApp("light")); // "App with light theme"

// Default can use PREVIOUS parameters:
function buildUrl(host, port = 80, path = `/${host}`) {
  return `http://${host}:${port}${path}`;
}
console.log(buildUrl("example.com"));            // http://example.com:80/example.com
console.log(buildUrl("example.com", 3000));      // http://example.com:3000/example.com
console.log(buildUrl("example.com", 3000, "/api")); // http://example.com:3000/api

// ══════════════════════════════════════════════════════════════════
// § 3 — DEFAULTS AND THE arguments OBJECT GOTCHA
// ══════════════════════════════════════════════════════════════════
// In a function with default params, `arguments` reflects the ACTUAL
// arguments passed, NOT the defaults.

function showDiff(a = 10, b = 20) {
  console.log(a, b);              // uses defaults: 10, 20
  console.log(arguments.length);  // 0 — nothing was actually passed!
}
showDiff();         // arguments.length = 0

function showDiff2(a = 10, b = 20) {
  console.log(a, b);
  console.log(arguments.length);  // 1 — only one arg was actually passed
}
showDiff2(5);       // arguments.length = 1, a = 5, b = 20 (default)

// ══════════════════════════════════════════════════════════════════
// § 4 — DEFAULTS + DESTRUCTURING (very common pattern)
// ══════════════════════════════════════════════════════════════════

// Default for an options object:
function createUser({
  name     = "Anonymous",
  role     = "user",
  active   = true,
  theme    = "light",
} = {}) {   // ← the `= {}` means the whole arg defaults to {} if not passed
  return { name, role, active, theme };
}

console.log(createUser());                        // all defaults
console.log(createUser({ name: "Alice" }));       // name overridden
console.log(createUser({ name: "Bob", role: "admin", active: false }));

// ── Real API function with options ───────────────────────────────
async function fetchData(url, {
  method  = "GET",
  headers = { "Content-Type": "application/json" },
  timeout = 5000,
  retries = 3,
} = {}) {
  console.log(`${method} ${url} (timeout: ${timeout}ms, retries: ${retries})`);
  // const response = await fetch(url, { method, headers });
}
fetchData("/api/users");
fetchData("/api/users", { method: "POST", timeout: 10000 });

// ══════════════════════════════════════════════════════════════════
// § 5 — TDZ IN DEFAULT PARAMETERS
// ══════════════════════════════════════════════════════════════════
// Parameters are evaluated left-to-right.
// A later parameter CANNOT reference a parameter that comes after it.

// ✅ Safe: reference earlier param
function safe(a, b = a * 2) { return [a, b]; }
console.log(safe(5)); // [5, 10]

// ❌ TDZ: reference later param
// function bad(a = b, b = 1) { return [a, b]; } // ❌ ReferenceError

// ✅ Safe: reference param by position (earlier is fine)
function rectangle(width, height = width) {
  return width * height;  // square if only width provided
}
console.log(rectangle(5));     // 25 (square)
console.log(rectangle(5, 10)); // 50

// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════
// Q1. What triggers a default parameter?
// Only `undefined` or a missing argument. null, false, 0, "" do NOT trigger defaults.

// Q2. Can default params reference other params?
// Yes, but only EARLIER (left) params. Referencing a later param = TDZ ReferenceError.

// Q3. Are default expressions evaluated once or each call?
// Each call. `Date.now()` as default generates a new timestamp on every call.

// Q4. How do defaults interact with arguments object?
// arguments reflects ACTUAL args passed, not defaults. If you call f() with no args
// and the function has default params, arguments.length = 0.

// Q5. How do you default an entire options object?
// Destructure with defaults AND add `= {}` as the parameter default:
// function fn({ a = 1, b = 2 } = {}) {}
// Without `= {}`, calling fn() with no args would throw (can't destructure undefined).

// Q6. Can you use a function call as a default?
// Yes. The function is called each time the param is triggered.
// Useful for generating IDs, getting timestamps, or computing complex defaults.

// Q7. How did developers handle defaults before ES6?
// Manual checks: `name = name !== undefined ? name : "default"` or
// the OR pattern: `name = name || "default"` (but || also catches 0, "", false —
// which is a bug if those are valid values).

// 📚 NEXT → 11_rest-and-spread.js
