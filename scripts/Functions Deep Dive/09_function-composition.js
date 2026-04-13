// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  09_function-composition.js            ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: compose vs pipe, implementation, real pipelines, 7 Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS FUNCTION COMPOSITION?
// ══════════════════════════════════════════════════════════════════
// Combining multiple functions where the OUTPUT of one becomes
// the INPUT of the next.
//
// Math: f∘g∘h means h(x) first, then g, then f → f(g(h(x)))
//
// TWO directions:
//   compose(f, g, h)(x) = f(g(h(x)))  → right-to-left (math style)
//   pipe(h, g, f)(x)    = f(g(h(x)))  → left-to-right (reading order)
//
// pipe is usually more readable — functions applied in order you list them.

// ══════════════════════════════════════════════════════════════════
// § 2 — IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════════

// compose: right to left
const compose = (...fns) => (x) => fns.reduceRight((v, fn) => fn(v), x);

// pipe: left to right (easier to read)
const pipe = (...fns) => (x) => fns.reduce((v, fn) => fn(v), x);

// ══════════════════════════════════════════════════════════════════
// § 3 — USAGE EXAMPLES
// ══════════════════════════════════════════════════════════════════

const trim    = (s) => s.trim();
const lower   = (s) => s.toLowerCase();
const words   = (s) => s.split(" ");
const exclaim = (s) => s + "!";
const upper   = (s) => s.toUpperCase();

// pipe: applied left → right (trim first, then lower, then exclaim)
const formatInput = pipe(trim, lower, exclaim);
console.log(formatInput("  HELLO WORLD  ")); // "hello world!"

// compose: applied right → left (exclaim first, then lower, then trim)
const formatInput2 = compose(trim, lower, exclaim);
console.log(formatInput2("  HELLO  ")); // "hello!" (exclaim → lower → trim)

// ── String processing pipeline ────────────────────────────────────
const processName = pipe(
  s => s.trim(),
  s => s.toLowerCase(),
  s => s.split(" "),
  parts => parts.map(p => p[0].toUpperCase() + p.slice(1)),
  parts => parts.join(" ")
);
console.log(processName("  JOHN   DOE  ")); // "John Doe"

// ── Number transformation pipeline ───────────────────────────────
const processPrice = pipe(
  (p) => p * 1.18,             // add 18% tax
  (p) => Math.round(p * 100) / 100, // round to 2 decimal places
  (p) => `₹${p.toFixed(2)}`,   // format as currency
);
console.log(processPrice(1000)); // "₹1180.00"

// ── Data transformation pipeline ─────────────────────────────────
const processUsers = pipe(
  (users) => users.filter(u => u.active),
  (users) => users.map(u => ({ ...u, name: u.name.trim() })),
  (users) => users.sort((a, b) => a.name.localeCompare(b.name)),
  (users) => users.map(u => u.name),
);

const rawUsers = [
  { name: "  Carol ", active: true  },
  { name: " Bob",     active: false },
  { name: "Alice  ",  active: true  },
];
console.log(processUsers(rawUsers)); // ["Alice", "Carol"]


// ══════════════════════════════════════════════════════════════════
// § 4 — ASYNC COMPOSITION (pipe for Promises)
// ══════════════════════════════════════════════════════════════════

const pipeAsync = (...fns) => (x) =>
  fns.reduce((promise, fn) => promise.then(fn), Promise.resolve(x));

const fetchUser      = async (id)   => ({ id, name: "Alice", role: "user" });
const enrichWithPerms = async (user) => ({ ...user, perms: ["read", "write"] });
const formatUser      = async (user) => ({ ...user, displayName: user.name.toUpperCase() });

const getProcessedUser = pipeAsync(fetchUser, enrichWithPerms, formatUser);
getProcessedUser(1).then(console.log);
// { id: 1, name: "Alice", role: "user", perms: [...], displayName: "ALICE" }


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS
// ══════════════════════════════════════════════════════════════════

// Q1. What is function composition?
// Combining functions where output of one becomes input of the next.
// Creates a pipeline of transformations.

// Q2. What is the difference between compose and pipe?
// compose: right-to-left (last function runs first — math convention).
// pipe: left-to-right (first function runs first — reading order, more intuitive).

// Q3. Implement pipe from scratch.
// (…fns) => (x) => fns.reduce((v, fn) => fn(v), x)

// Q4. What constraint must each function in a composition meet?
// Output type of each function must match the input type of the next.
// Each function should take exactly ONE argument (unary) for clean composition.
// This is why currying and partial application pair well with composition.

// Q5. What is the relationship between pipe and currying?
// Curried functions produce unary functions — perfect for pipe/compose
// because each function takes exactly 1 argument. They work together
// to build powerful functional pipelines.

// Q6. Is function composition the same as method chaining?
// Similar concept — both chain operations. But chaining requires methods
// on the same object (fluent interface). Composition works with any functions.

// Q7. What does React's middleware (Redux) have to do with composition?
// Redux's applyMiddleware is essentially function composition — each middleware
// wraps the next, creating a composed dispatch function. Same with Express middleware.

// 📚 NEXT → 10_default-parameters.js
