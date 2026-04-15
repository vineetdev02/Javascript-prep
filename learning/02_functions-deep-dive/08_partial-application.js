// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  08_partial-application.js             ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: partial(), bind() for partial, real patterns, 6 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS PARTIAL APPLICATION?
// ══════════════════════════════════════════════════════════════════
// Pre-fill (fix) ONE OR MORE arguments of a function.
// Returns a NEW function waiting for the remaining arguments.
// The original function is NOT called yet.
//
// Real-world analogy:
// A function that sends emails: sendEmail(from, to, subject, body)
// You always send FROM the same address — pre-fill `from`:
//   const sendFromMe = partial(sendEmail, "me@example.com");
//   sendFromMe("you@example.com", "Hello", "Hi there!"); ← only remaining args

// ══════════════════════════════════════════════════════════════════
// § 2 — IMPLEMENTING partial()
// ══════════════════════════════════════════════════════════════════

function partial(fn, ...presetArgs) {
  return function(...remainingArgs) {
    return fn(...presetArgs, ...remainingArgs);
  };
}

// Basic example:
const multiply = (a, b, c) => a * b * c;

const double       = partial(multiply, 2);      // pre-fill a=2
const triple       = partial(multiply, 3);      // pre-fill a=3
const sixTimes     = partial(multiply, 2, 3);   // pre-fill a=2, b=3

console.log(double(5, 4));   // 40 → 2*5*4
console.log(triple(5, 4));   // 60 → 3*5*4
console.log(sixTimes(7));    // 42 → 2*3*7

// ══════════════════════════════════════════════════════════════════
// § 3 — USING .bind() FOR PARTIAL APPLICATION
// ══════════════════════════════════════════════════════════════════
// Function.prototype.bind(thisArg, ...presetArgs)
// bind's second+ args are pre-filled — this is partial application built-in!

function greet(greeting, name) {
  return `${greeting}, ${name}!`;
}

const sayHello = greet.bind(null, "Hello"); // pre-fill greeting="Hello"
const sayHi    = greet.bind(null, "Hi");

console.log(sayHello("Alice")); // "Hello, Alice!"
console.log(sayHi("Bob"));     // "Hi, Bob!"

// ══════════════════════════════════════════════════════════════════
// § 4 — REAL USE CASES
// ══════════════════════════════════════════════════════════════════

// ── API endpoint builder ──────────────────────────────────────────
async function apiCall(baseUrl, method, endpoint, data) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    body: data ? JSON.stringify(data) : null,
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}
const prodApi = partial(apiCall, "https://api.prod.com");
const get     = partial(prodApi, "GET");
const post    = partial(prodApi, "POST");

// const users   = await get("/users");
// const newUser = await post("/users", { name: "Alice" });

// ── Event handlers ────────────────────────────────────────────────
function handleAction(type, payload, event) {
  console.log(`Action: ${type}`, payload, event?.target);
}
const handleLogin  = partial(handleAction, "LOGIN",  { redirect: "/dashboard" });
const handleLogout = partial(handleAction, "LOGOUT", { redirect: "/login"     });
// button.addEventListener("click", handleLogin);

// ── Tax calculator ────────────────────────────────────────────────
const calculateTax = (taxRate, price) => price * (1 + taxRate);
const withGST  = partial(calculateTax, 0.18); // 18% GST (India)
const withVAT  = partial(calculateTax, 0.20); // 20% VAT (UK)
console.log(withGST(1000));  // 1180
console.log(withVAT(1000));  // 1200

// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════
// Q1. What is partial application?
// Pre-filling some arguments of a function, returning a new function for the rest.
// Q2. How does .bind() support partial application?
// bind(thisArg, arg1, arg2) — args after thisArg are pre-filled.
// Q3. Difference from currying?
// Currying: always 1 arg/step. Partial: any number at once.
// Q4. When would you use partial application?
// When you repeatedly call a function with the same first arguments (baseUrl, taxRate).
// Q5. Can you partially apply arrow functions?
// Yes, using a custom partial() — .bind() also works on arrows but thisArg is ignored.
// Q6. What does partial() return?
// A new function (closure) that closes over the preset args and combines them
// with remaining args when eventually called.

// 📚 NEXT → 09_function-composition.js
