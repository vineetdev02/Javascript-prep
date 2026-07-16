// ╔══════════════════════════════════════════════════════════════════╗
// ║   Functions Deep Dive  →  05_pure-functions.js                  ║
// ╚══════════════════════════════════════════════════════════════════╝
// 🎯 MASTER: Pure vs impure, side effects, referential transparency,
//    why purity matters, real patterns, 7 interview Q&As

// ══════════════════════════════════════════════════════════════════
// § 1 — WHAT IS A PURE FUNCTION?
// ══════════════════════════════════════════════════════════════════
// A function is PURE if it satisfies BOTH rules:
//   Rule 1: Same input → ALWAYS same output (deterministic)
//   Rule 2: NO side effects (doesn't modify anything outside itself)
//
// A SIDE EFFECT is any interaction with the outside world:
//   • Modifying a variable outside the function
//   • Mutating an argument (object/array)
//   • Making API calls / reading files
//   • Writing to DOM / console.log
//   • Generating random numbers / Date.now()
//   • Reading/writing to database

// ── Pure examples ────────────────────────────────────────────────
const add          = (a, b) => a + b;            // ✅ same in → same out
const multiply     = (a, b) => a * b;            // ✅
const toUpperCase  = (s) => s.toUpperCase();     // ✅
const getFullName  = (u) => `${u.first} ${u.last}`; // ✅ reads but doesn't mutate

// ── Impure examples ──────────────────────────────────────────────
let total = 0;
const addToTotal = (n) => { total += n; };       // ❌ modifies outer variable

const getTimestamp = () => Date.now();            // ❌ different output each call
const getRandom    = () => Math.random();         // ❌ different output each call
const fetchData    = async (url) => fetch(url);  // ❌ network side effect
const logAndReturn = (x) => { console.log(x); return x; }; // ❌ console.log is side effect


// ══════════════════════════════════════════════════════════════════
// § 2 — MUTATION: THE MOST COMMON PURITY BUG
// ══════════════════════════════════════════════════════════════════

// ── Impure — mutates argument ────────────────────────────────────
function addTaxImpure(cart) {
  cart.total = cart.total * 1.1; // ❌ mutates the original object!
  return cart;
}
const myCart = { items: 3, total: 100 };
addTaxImpure(myCart);
console.log(myCart.total); // 110 — original CHANGED without warning!

// ── Pure — returns new object, original unchanged ─────────────────
const addTaxPure = (cart) => ({
  ...cart,                         // spread copy
  total: cart.total * 1.1,        // override only total
});
const myCart2   = { items: 3, total: 100 };
const taxedCart = addTaxPure(myCart2);
console.log(myCart2.total);   // 100 — UNCHANGED ✅
console.log(taxedCart.total); // 110 — new object ✅

// ── Impure — mutates array argument ──────────────────────────────
function addItemImpure(items, item) {
  items.push(item); // ❌ mutates original
  return items;
}

// ── Pure — returns new array ──────────────────────────────────────
const addItemPure = (items, item) => [...items, item]; // ✅ spread copy + new item
const addItemPure2 = (items, item) => items.concat(item); // ✅ concat returns new array


// ══════════════════════════════════════════════════════════════════
// § 3 — REFERENTIAL TRANSPARENCY
// ══════════════════════════════════════════════════════════════════
// A pure function call can be REPLACED by its return value without
// changing the program behavior. This is called "referential transparency".

// add(2, 3) can always be replaced by 5 — anywhere, any time.
// Referentially transparent: add(2, 3) === 5  ALWAYS ✅

// getRandom() CANNOT be replaced — it's different each time. ❌

// WHY IT MATTERS:
//   • Optimization: JS engine can cache the result (memoize)
//   • Testing: no need to mock external state
//   • Debugging: trace input → output, no hidden state
//   • Parallel execution: no race conditions (no shared mutable state)


// ══════════════════════════════════════════════════════════════════
// § 4 — WHY PURE FUNCTIONS MATTER IN REAL CODE
// ══════════════════════════════════════════════════════════════════

// ── React: Pure components & immutable state ─────────────────────
// React requires state updates to be PURE — return new state, don't mutate.
// Wrong (impure):
// this.state.items.push(newItem);      // ❌ mutates state directly
// setState({ items: this.state.items }) // React won't re-render!

// Right (pure):
// setState(prev => ({ items: [...prev.items, newItem] })); // ✅ new array

// ── Redux: Reducers MUST be pure ─────────────────────────────────
function cartReducer(state = { items: [], total: 0 }, action) {
  switch(action.type) {
    case "ADD_ITEM":
      return {
        ...state,                               // ✅ copy, don't mutate
        items: [...state.items, action.item],  // ✅ new array
        total: state.total + action.item.price,
      };
    case "CLEAR":
      return { items: [], total: 0 }; // ✅ new state object
    default:
      return state;
  }
}

// ── Unit testing: pure functions are trivially testable ──────────
// Pure:
const calculateDiscount = (price, percent) => price * (1 - percent / 100);
// Test: calculateDiscount(100, 10) === 90 — no mocks needed ✅

// Impure — needs mocks:
// function applyDiscount(productId) {
//   const product = db.find(productId); // needs DB mock
//   const now = Date.now();             // needs time mock
//   product.price *= 0.9;              // mutates — needs before/after check
// }


// ══════════════════════════════════════════════════════════════════
// § 5 — MANAGING SIDE EFFECTS (real world can't be 100% pure)
// ══════════════════════════════════════════════════════════════════
// Pure code at the core, impure code at the edges.
// Business logic = pure. I/O = impure but isolated.

// Impure edge (network):
async function fetchUsers(url) {
  const res  = await fetch(url); // impure — network
  const data = await res.json(); // impure — I/O
  return data.users;
}

// Pure core (transformation):
const normalizeUsers = (users) =>            // ✅ pure
  users
    .filter(u => u.active)
    .map(u => ({ id: u.id, name: u.name.trim() }));

// Composition:
async function getActiveUsers() {
  const raw = await fetchUsers("/api/users"); // impure — at the edge
  return normalizeUsers(raw);                 // pure — at the core
}


// ══════════════════════════════════════════════════════════════════
// ❓ INTERVIEW QUESTIONS + MODEL ANSWERS
// ══════════════════════════════════════════════════════════════════

// Q1. What is a pure function?
// Two rules: 1) same input → always same output. 2) no side effects.
// It doesn't modify anything outside itself and doesn't depend on external state.

// Q2. What is a side effect?
// Any interaction with the outside world: mutating outer variables, modifying
// arguments, console.log, API calls, DOM manipulation, Date.now(), Math.random().

// Q3. Why are pure functions preferred?
// Predictable (same input/output), testable (no mocks), debuggable (trace inputs),
// cacheable (memoization), safe for concurrent execution (no shared state).

// Q4. Is console.log a side effect?
// Yes. It writes to stdout — interaction with the outside world.
// A function that only calls console.log is impure.

// Q5. Can you have 100% pure code in a real application?
// No. Real apps need I/O (DB, network, DOM). The goal is to ISOLATE impure code
// at the edges (API calls, event handlers) and keep business logic pure.

// Q6. Why must Redux reducers be pure?
// Redux uses reference equality to detect state changes. If you mutate state
// directly, the reference doesn't change → Redux thinks nothing changed →
// connected components don't re-render. Pure reducers always return new objects.

// Q7. What is referential transparency?
// A pure function call can be replaced by its return value without changing
// program behavior: `add(2,3)` can always be replaced by `5`. This enables
// optimization (memoization, parallel execution) and easier reasoning.

// 📚 NEXT → 06_first-class-functions.js
